/// <reference types="@webgpu/types" />
import "./style.css";
import shaderCode from "./shader.wgsl?raw";
import { Camera } from "./camera";
import { mat4 } from "./math";
import type { MeshData } from "./mesh";
import { createCubeMesh } from "./cubeMesh";

if (!navigator.gpu) {
  throw new Error("WebGPU not supported");
}

const canvas = document.querySelector("#gfx-main") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gfx-main not found");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No GPU adapter found");

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
if (!context) throw new Error("Could not get WebGPU context");

const format = navigator.gpu.getPreferredCanvasFormat();
let depthTexture: GPUTexture | null = null;

function resize() {
  canvas.width = Math.max(1, Math.floor(window.innerWidth * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * devicePixelRatio));

  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  depthTexture?.destroy();
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });
}
resize();
window.addEventListener("resize", resize);

function interleaveMesh(mesh: MeshData): Float32Array {
  const vertexCount = mesh.positions.length / 3;
  const out = new Float32Array(vertexCount * 8);

  for (let i = 0; i < vertexCount; i++) {
    const p = i * 3;
    const n = i * 3;
    const uv = i * 2;
    const o = i * 8;

    out[o + 0] = mesh.positions[p + 0];
    out[o + 1] = mesh.positions[p + 1];
    out[o + 2] = mesh.positions[p + 2];

    out[o + 3] = mesh.normals[n + 0];
    out[o + 4] = mesh.normals[n + 1];
    out[o + 5] = mesh.normals[n + 2];

    out[o + 6] = mesh.uvs[uv + 0];
    out[o + 7] = mesh.uvs[uv + 1];
  }

  return out;
}

function buildBuffersFromMesh(mesh: MeshData) {
  const interleaved = interleaveMesh(mesh);

  const vertexBuffer = device.createBuffer({
    size: interleaved.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, interleaved);

  const indexBuffer = device.createBuffer({
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  return {
    vertexBuffer,
    indexBuffer,
    indexCount: mesh.indices.length,
  };
}

const uniformBuffer = device.createBuffer({
  size: 64,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const shader = device.createShaderModule({
  label: "Mesh Shader",
  code: shaderCode,
});

const pipeline = device.createRenderPipeline({
  label: "Mesh Pipeline",
  layout: "auto",
  vertex: {
    module: shader,
    entryPoint: "vs_main",
    buffers: [
      {
        arrayStride: 8 * 4, // x y z nx ny nz u v
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
          { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
        ],
      },
    ],
  },
  fragment: {
    module: shader,
    entryPoint: "fs_main",
    targets: [{ format }],
  },
  primitive: {
    topology: "triangle-list",
    cullMode: "back",
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less",
  },
});

async function loadTextureOrCheckerboard(url: string): Promise<GPUTexture> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const blob = await res.blob();
    const image = await createImageBitmap(blob, { colorSpaceConversion: "none" });

    const tex = device.createTexture({
      size: [image.width, image.height, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: image },
      { texture: tex },
      [image.width, image.height]
    );

    return tex;
  } catch (err) {
    console.warn("Texture load failed, using checkerboard fallback:", err);

    const w = 128;
    const h = 128;
    const data = new Uint8Array(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const checker = ((x >> 4) & 1) ^ ((y >> 4) & 1);
        const c = checker ? 230 : 35;
        data[i + 0] = c;
        data[i + 1] = c;
        data[i + 2] = c;
        data[i + 3] = 255;
      }
    }

    const tex = device.createTexture({
      size: [w, h, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
      { texture: tex },
      data,
      { bytesPerRow: w * 4, rowsPerImage: h },
      [w, h, 1]
    );

    return tex;
  }
}

const texture = await loadTextureOrCheckerboard("/textures/uv-test.png");

const sampler = device.createSampler({
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "repeat",
  addressModeV: "repeat",
});

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: sampler },
    { binding: 2, resource: texture.createView() },
  ],
});

let activeMesh: MeshData = createCubeMesh();
let { vertexBuffer, indexBuffer, indexCount } = buildBuffersFromMesh(activeMesh);

const camera = new Camera();
const keys = new Set<string>();

window.addEventListener("keydown", (e) => keys.add(e.key));
window.addEventListener("keyup", (e) => keys.delete(e.key));

let lastTime = performance.now();

function frame(now: number) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  camera.update(keys, dt);

  const aspect = canvas.width / canvas.height;
  const proj = mat4.perspective((60 * Math.PI) / 180, aspect, 0.1, 100.0);
  const view = camera.getViewMatrix();

  const model = mat4.identity();
  const vp = mat4.multiply(proj, view);
  const mvp = mat4.multiply(vp, model);

  device.queue.writeBuffer(uniformBuffer, 0, mvp);

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.06, g: 0.08, b: 0.12, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
    depthStencilAttachment: {
      view: depthTexture!.createView(),
      depthClearValue: 1.0,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setIndexBuffer(indexBuffer, "uint32");
  pass.drawIndexed(indexCount);
  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);