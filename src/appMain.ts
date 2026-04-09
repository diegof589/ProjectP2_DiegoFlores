/// <reference types="@webgpu/types" />
import "./app.css";
import shaderCode from "./appShader.wgsl?raw";
import { dragToArcballRotation } from "./arcball";
import {
  buildRenderGeometry,
  createCubeMesh,
  createSphereMesh,
  ensureUVs,
  normalizeName,
  type MeshData,
} from "./appMesh";
import {
  createControlPanel,
  type DisplayMode,
  type LightType,
  type ShadingMode,
  type TextureMode,
} from "./appGui";
import { loadOBJFromText } from "./appObjLoader";
import { clamp, mat4, quat, type Mat4, type Quat, type Vec3, vec3 } from "./math3d";

if (!navigator.gpu) {
  throw new Error("WebGPU is not supported in this browser.");
}

type BuiltinKind = "teapot" | "beacon" | "cube" | "sphere";

interface TextureRecord {
  texture: GPUTexture;
  view: GPUTextureView;
}

interface SceneObject {
  id: string;
  label: string;
  originalMesh: MeshData;
  mesh: MeshData;
  vertexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  vertexCount: number;
  bindGroup: GPUBindGroup;
  position: Vec3;
  rotation: Quat;
  scale: number;
  baseScale: number;
  color: Vec3;
  textureMode: TextureMode;
  sphericalUV: boolean;
  uploadedTexture: TextureRecord | null;
}

interface SceneSettings {
  shadingMode: ShadingMode;
  displayMode: DisplayMode;
  lightType: LightType;
  lightEnabled: boolean;
  autoRotateLight: boolean;
  followCameraLight: boolean;
  lightColor: Vec3;
  lightPosition: Vec3;
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
  lightIntensity: number;
  zoom: number;
}

const canvasNode = document.querySelector<HTMLCanvasElement>("#gfx-main");
if (!canvasNode) {
  throw new Error("Canvas #gfx-main not found.");
}
const canvas: HTMLCanvasElement = canvasNode;

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No compatible GPU adapter found.");
}

const device = await adapter.requestDevice();
const contextValue = canvas.getContext("webgpu");
if (!contextValue) {
  throw new Error("Could not acquire a WebGPU context.");
}
const context: GPUCanvasContext = contextValue;

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
const depthFormat: GPUTextureFormat = "depth24plus";
const normalFormat: GPUTextureFormat = "rgba8unorm";
const sampler = device.createSampler({
  magFilter: "linear",
  minFilter: "linear",
  mipmapFilter: "linear",
  addressModeU: "repeat",
  addressModeV: "repeat",
});

const shader = device.createShaderModule({
  label: "Object Order Shader",
  code: shaderCode,
});

const pipeline = device.createRenderPipeline({
  label: "Object Order Pipeline",
  layout: "auto",
  vertex: {
    module: shader,
    entryPoint: "vs_main",
    buffers: [
      {
        arrayStride: 11 * 4,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
          { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
          { shaderLocation: 3, offset: 8 * 4, format: "float32x3" },
        ],
      },
    ],
  },
  fragment: {
    module: shader,
    entryPoint: "fs_main",
    targets: [
      { format: canvasFormat },
      { format: normalFormat },
    ],
  },
  primitive: {
    topology: "triangle-list",
    cullMode: "none",
  },
  depthStencil: {
    format: depthFormat,
    depthWriteEnabled: true,
    depthCompare: "less",
  },
});

let depthTexture: GPUTexture | null = null;
let normalTexture: GPUTexture | null = null;
function resizeCanvas() {
  canvas.width = Math.max(1, Math.floor(window.innerWidth * window.devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * window.devicePixelRatio));
  context.configure({
    device,
    format: canvasFormat,
    alphaMode: "premultiplied",
  });

  depthTexture?.destroy();
  normalTexture?.destroy();
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  normalTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: normalFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const textures = new Map<TextureMode, TextureRecord>();
textures.set("uv", createProceduralTexture(device, "uv"));
textures.set("checker", createProceduralTexture(device, "checker"));
textures.set("stripes", createProceduralTexture(device, "stripes"));

const settings: SceneSettings = {
  shadingMode: "phong",
  displayMode: "shaded",
  lightType: "point",
  lightEnabled: true,
  autoRotateLight: false,
  followCameraLight: false,
  lightColor: [1, 1, 1],
  lightPosition: [2.2, 3.4, 2.6],
  ambient: 0.18,
  diffuse: 0.95,
  specular: 0.6,
  shininess: 36,
  lightIntensity: 1.2,
  zoom: 1.7,
};

const cameraState = {
  rotation: quat.identity() as Quat,
  target: [0, 0, 0] as Vec3,
};
let displayedLightPosition: Vec3 = [2.2, 3.4, 2.6];

const builtinCache = new Map<BuiltinKind, Promise<MeshData>>();
const objects: SceneObject[] = [];
let selectedObjectId: string | null = null;
let nextObjectIndex = 1;
let panelDirty = true;
let statusText = "Load an OBJ or add a built-in model. Drag with the mouse for arcball rotation.";

const panel = createControlPanel({
  onAddBuiltin: (kind) => {
    void addBuiltinObject(kind);
  },
  onSelectObject: (id) => {
    selectedObjectId = id;
    const object = getSelectedObject();
    statusText = object
      ? `${object.label} selected from the panel. Drag to rotate this object. Use Deselect to orbit the camera.`
      : statusText;
    panelDirty = true;
  },
  onClearSelection: () => {
    selectedObjectId = null;
    statusText = "No object selected. Drag on the canvas to orbit the camera.";
    panelDirty = true;
  },
  onDeleteSelected: () => {
    deleteSelectedObject();
  },
  onUploadOBJ: (file) => {
    void loadUploadedObject(file);
  },
  onUploadTexture: (file) => {
    void applyUploadedTexture(file);
  },
  onShadingMode: (mode) => {
    settings.shadingMode = mode;
    panelDirty = true;
  },
  onDisplayMode: (mode) => {
    settings.displayMode = mode;
    panelDirty = true;
  },
  onLightType: (type) => {
    settings.lightType = type;
    panelDirty = true;
  },
  onLightEnabled: (enabled) => {
    settings.lightEnabled = enabled;
    panelDirty = true;
  },
  onAutoRotateLight: (enabled) => {
    settings.autoRotateLight = enabled;
    panelDirty = true;
  },
  onLightColor: (value) => {
    settings.lightColor = hexToRgb(value);
    panelDirty = true;
  },
  onFollowCameraLight: (enabled) => {
    settings.followCameraLight = enabled;
    panelDirty = true;
  },
  onLightingValue: (key, value) => {
    if (key === "lightX") {
      settings.lightPosition = [value, settings.lightPosition[1], settings.lightPosition[2]];
      settings.followCameraLight = false;
    } else if (key === "lightY") {
      settings.lightPosition = [settings.lightPosition[0], value, settings.lightPosition[2]];
      settings.followCameraLight = false;
    } else if (key === "lightZ") {
      settings.lightPosition = [settings.lightPosition[0], settings.lightPosition[1], value];
      settings.followCameraLight = false;
    } else {
      settings[key] = value;
    }
    panelDirty = true;
  },
  onSelectedTransform: (key, value) => {
    const object = getSelectedObject();
    if (!object) {
      return;
    }

    const euler = quat.toEulerDegrees(object.rotation);
    if (key === "positionX") object.position = [value, object.position[1], object.position[2]];
    if (key === "positionY") object.position = [object.position[0], value, object.position[2]];
    if (key === "positionZ") object.position = [object.position[0], object.position[1], value];
    if (key === "rotationX") object.rotation = quat.fromEulerDegrees([value, euler[1], euler[2]]);
    if (key === "rotationY") object.rotation = quat.fromEulerDegrees([euler[0], value, euler[2]]);
    if (key === "rotationZ") object.rotation = quat.fromEulerDegrees([euler[0], euler[1], value]);
    if (key === "scale") object.scale = value;
    panelDirty = true;
  },
  onSelectedColor: (value) => {
    const object = getSelectedObject();
    if (!object) {
      return;
    }
    object.color = hexToRgb(value);
    panelDirty = true;
  },
  onSelectedTextureMode: (mode) => {
    const object = getSelectedObject();
    if (!object) {
      return;
    }
    object.textureMode = mode;
    object.bindGroup = createObjectBindGroup(object);
    panelDirty = true;
  },
  onSelectedSphericalUV: (enabled) => {
    const object = getSelectedObject();
    if (!object) {
      return;
    }
    object.sphericalUV = enabled;
    rebuildObjectGeometry(object);
    panelDirty = true;
  },
});

const pointerState = {
  active: false,
  lastX: 0,
  lastY: 0,
  mode: "camera" as "camera" | "object",
  objectId: null as string | null,
};

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  const selectedObject = getSelectedObject();
  if (selectedObject) {
    pointerState.mode = "object";
    pointerState.objectId = selectedObject.id;
    statusText = `${selectedObject.label} rotation mode.`;
  } else {
    pointerState.mode = "camera";
    pointerState.objectId = null;
    statusText = "Camera orbit mode.";
  }
  pointerState.active = true;
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  panelDirty = true;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerState.active) {
    return;
  }

  const start = pointerToArcball(pointerState.lastX, pointerState.lastY);
  const end = pointerToArcball(event.clientX, event.clientY);
  const delta = dragToArcballRotation(start[0], start[1], end[0], end[1]);
  const activeObject = pointerState.objectId
    ? objects.find((object) => object.id === pointerState.objectId)
    : undefined;

  if (pointerState.mode === "object" && activeObject) {
    activeObject.rotation = quat.normalize(quat.multiply(delta, activeObject.rotation));
  } else {
    cameraState.rotation = quat.normalize(quat.multiply(delta, cameraState.rotation));
  }

  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  panelDirty = true;
});

canvas.addEventListener("pointerup", (event) => {
  pointerState.active = false;
  pointerState.objectId = null;
  pointerState.mode = "camera";
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointerleave", () => {
  pointerState.active = false;
  pointerState.objectId = null;
  pointerState.mode = "camera";
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  settings.zoom = clamp(settings.zoom + event.deltaY * 0.001, 0.8, 5);
  panelDirty = true;
}, { passive: false });

await addBuiltinObject("teapot");

function frame() {
  if (settings.autoRotateLight || settings.followCameraLight) {
    panelDirty = true;
  }
  syncPanel();
  renderScene();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

function syncPanel() {
  if (!panelDirty) {
    return;
  }

  const selected = getSelectedObject();
  panel.update({
    shadingMode: settings.shadingMode,
    displayMode: settings.displayMode,
    lightType: settings.lightType,
    lightEnabled: settings.lightEnabled,
    autoRotateLight: settings.autoRotateLight,
    followCameraLight: settings.followCameraLight,
    lightColorHex: rgbToHex(settings.lightColor),
    lightPosition: displayedLightPosition,
    ambient: settings.ambient,
    diffuse: settings.diffuse,
    specular: settings.specular,
    shininess: settings.shininess,
    lightIntensity: settings.lightIntensity,
    zoom: settings.zoom,
    objects: objects.map((object) => ({
      id: object.id,
      label: object.label,
      selected: object.id === selectedObjectId,
    })),
    selectedObject: selected
      ? {
          id: selected.label,
          position: selected.position,
          rotation: quat.toEulerDegrees(selected.rotation),
          scale: selected.scale,
          colorHex: rgbToHex(selected.color),
          textureMode: selected.textureMode,
          sphericalUV: selected.sphericalUV,
          boundsLabel: describeMesh(selected.mesh),
        }
      : null,
    statusText,
  });
  panelDirty = false;
}

function renderScene() {
  if (!depthTexture || !normalTexture) {
    return;
  }

  const sceneStats = computeSceneStats();
  const aspect = canvas.width / canvas.height;
  const cameraDistance = getCameraDistance(sceneStats.radius);
  const near = Math.max(0.05, cameraDistance - sceneStats.radius * 3.5);
  const far = cameraDistance + sceneStats.radius * 4.5;
  const projection = mat4.perspective((55 * Math.PI) / 180, aspect, near, far);
  cameraState.target = sceneStats.center;

  const eyeOffset = quat.rotateVector(cameraState.rotation, [0, 0, cameraDistance]);
  const cameraUp = quat.rotateVector(cameraState.rotation, [0, 1, 0]);
  const cameraPos = vec3.add(cameraState.target, eyeOffset);
  const view = mat4.lookAt(cameraPos, cameraState.target, cameraUp);
  const viewProj = mat4.multiply(projection, view);

  const animatedLightPosition = getAnimatedLightPosition(sceneStats.center);
  const lightPos = settings.followCameraLight
    ? vec3.add(cameraPos, quat.rotateVector(cameraState.rotation, [0.8, 1.6, 0.6]))
    : animatedLightPosition;
  displayedLightPosition = lightPos;
  const lightDir = settings.followCameraLight
    ? vec3.normalize(vec3.sub(cameraState.target, lightPos))
    : vec3.normalize(vec3.scale(settings.lightPosition, -1));

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.03, g: 0.05, b: 0.08, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: normalTexture.createView(),
        clearValue: { r: 0.5, g: 0.5, b: 1, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });

  pass.setPipeline(pipeline);

  for (const object of objects) {
    const model = getModelMatrix(object);
    const normalMat = mat4.normalMatrix(model);
    const data = new Float32Array(80);
    data.set(viewProj, 0);
    data.set(model, 16);
    data.set(normalMat, 32);
    data.set([cameraPos[0], cameraPos[1], cameraPos[2], 1], 48);
    data.set([lightPos[0], lightPos[1], lightPos[2], 1], 52);
    data.set([lightDir[0], lightDir[1], lightDir[2], 0], 56);
    data.set([
      settings.lightColor[0],
      settings.lightColor[1],
      settings.lightColor[2],
      settings.lightEnabled ? 1 : 0,
    ], 60);
    data.set([object.color[0], object.color[1], object.color[2], 1], 64);
    data.set([settings.ambient, settings.diffuse, settings.specular, settings.shininess], 68);
    data.set([
      shadingModeValue(settings.shadingMode),
      displayModeValue(settings.displayMode),
      settings.lightType === "directional" ? 1 : 0,
      settings.lightEnabled ? settings.lightIntensity : 0,
    ], 72);
    device.queue.writeBuffer(object.uniformBuffer, 0, data.buffer, data.byteOffset, data.byteLength);

    pass.setBindGroup(0, object.bindGroup);
    pass.setVertexBuffer(0, object.vertexBuffer);
    pass.draw(object.vertexCount);
  }

  pass.end();
  device.queue.submit([encoder.finish()]);
}

function displayModeValue(mode: DisplayMode): number {
  if (mode === "shaded") return 0;
  if (mode === "shaded-wire") return 1;
  if (mode === "wireframe") return 2;
  return 3;
}

function shadingModeValue(mode: ShadingMode): number {
  if (mode === "flat") return 0;
  if (mode === "gouraud") return 1;
  return 2;
}

function getModelMatrix(object: SceneObject): Mat4 {
  const positionMatrix = mat4.translation(object.position[0], object.position[1], object.position[2]);
  const rotationScale = mat4.compose(
    [0, 0, 0],
    object.rotation,
    [
      object.baseScale * object.scale,
      object.baseScale * object.scale,
      object.baseScale * object.scale,
    ],
  );
  const centerOffset = mat4.translation(
    -object.mesh.bounds.center[0],
    -object.mesh.bounds.center[1],
    -object.mesh.bounds.center[2],
  );
  return mat4.multiply(positionMatrix, mat4.multiply(rotationScale, centerOffset));
}

function getSelectedObject(): SceneObject | undefined {
  return objects.find((object) => object.id === selectedObjectId);
}

async function addBuiltinObject(kind: BuiltinKind) {
  statusText = `Loading ${kind}...`;
  panelDirty = true;

  const mesh = await loadBuiltinMesh(kind);
  const object = createSceneObject(mesh, kind);
  objects.push(object);
  selectedObjectId = object.id;
  statusText = `${object.label} loaded and selected. Use the panel to change selection.`;
  panelDirty = true;
}

async function loadBuiltinMesh(kind: BuiltinKind): Promise<MeshData> {
  const cached = builtinCache.get(kind);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    if (kind === "cube") {
      return createCubeMesh("cube");
    }
    if (kind === "sphere") {
      return createSphereMesh("sphere");
    }

    const url = kind === "beacon" ? "/models/KAUST_Beacon.obj" : "/models/teapot.obj";
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}`);
    }
    const text = await response.text();
    return loadOBJFromText(kind, text);
  })();

  builtinCache.set(kind, promise);
  return promise;
}

function createSceneObject(mesh: MeshData, source: string): SceneObject {
  const id = `obj-${nextObjectIndex++}`;
  const label = `${source}-${nextObjectIndex - 1}`;
  const baseScale = mesh.bounds.radius > 0 ? 1.6 / mesh.bounds.radius : 1;
  const initialPosition = getSpawnPosition(baseScale, mesh.bounds.radius);
  const uniformBuffer = device.createBuffer({
    size: 80 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const object: SceneObject = {
    id,
    label,
    originalMesh: mesh,
    mesh,
    vertexBuffer: device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.VERTEX,
    }),
    uniformBuffer,
    vertexCount: 0,
    bindGroup: undefined as unknown as GPUBindGroup,
    position: initialPosition,
    rotation: quat.identity(),
    scale: 1,
    baseScale,
    color: paletteColor(objects.length),
    textureMode: "uv",
    sphericalUV: source === "sphere" || !mesh.uvs.some((value) => value !== 0),
    uploadedTexture: null,
  };

  rebuildObjectGeometry(object);
  object.bindGroup = createObjectBindGroup(object);
  return object;
}

function rebuildObjectGeometry(object: SceneObject) {
  object.mesh = ensureUVs(object.originalMesh, object.sphericalUV);
  const geometry = buildRenderGeometry(object.mesh);
  object.vertexBuffer.destroy();
  object.vertexBuffer = device.createBuffer({
    size: geometry.vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    object.vertexBuffer,
    0,
    geometry.vertices.buffer,
    geometry.vertices.byteOffset,
    geometry.vertices.byteLength,
  );
  object.vertexCount = geometry.vertexCount;
}

function createObjectBindGroup(object: SceneObject): GPUBindGroup {
  const texture = resolveObjectTexture(object);
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: object.uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: texture.view },
    ],
  });
}

function resolveObjectTexture(object: SceneObject): TextureRecord {
  if (object.textureMode === "uploaded" && object.uploadedTexture) {
    return object.uploadedTexture;
  }
  return textures.get(object.textureMode) ?? textures.get("uv")!;
}

function deleteSelectedObject() {
  if (!selectedObjectId) {
    return;
  }

  const index = objects.findIndex((object) => object.id === selectedObjectId);
  if (index < 0) {
    return;
  }

  const [removed] = objects.splice(index, 1);
  removed.vertexBuffer.destroy();
  removed.uniformBuffer.destroy();
  removed.uploadedTexture?.texture.destroy();

  selectedObjectId = objects[0]?.id ?? null;
  statusText = removed ? `${removed.label} removed from the scene.` : statusText;
  panelDirty = true;
}

async function loadUploadedObject(file: File) {
  try {
    statusText = `Loading ${file.name}...`;
    panelDirty = true;
    const text = await file.text();
    const mesh = loadOBJFromText(normalizeName(file.name), text);
    const object = createSceneObject(mesh, normalizeName(file.name));
    objects.push(object);
    selectedObjectId = object.id;
    statusText = `${file.name} loaded and selected. Use the panel to choose which object to manipulate.`;
    panelDirty = true;
  } catch (error) {
    console.error(error);
    statusText = `Could not load ${file.name}. Check that it is a valid OBJ file.`;
    panelDirty = true;
  }
}

async function applyUploadedTexture(file: File) {
  const object = getSelectedObject();
  if (!object) {
    statusText = "Select an object before uploading a texture.";
    panelDirty = true;
    return;
  }

  try {
    const bitmap = await createImageBitmap(file, { colorSpaceConversion: "none" });
    object.uploadedTexture?.texture.destroy();
    object.uploadedTexture = createTextureFromBitmap(device, bitmap);
    object.textureMode = "uploaded";
    object.bindGroup = createObjectBindGroup(object);
    statusText = `Applied ${file.name} to ${object.label}.`;
    panelDirty = true;
  } catch (error) {
    console.error(error);
    statusText = `Could not use ${file.name} as a texture.`;
    panelDirty = true;
  }
}

function describeMesh(mesh: MeshData): string {
  return [
    `${mesh.name} | ${(mesh.indices.length / 3).toLocaleString()} triangles`,
    `center ${formatVec(mesh.bounds.center)} | radius ${mesh.bounds.radius.toFixed(3)}`,
    `face normals ${mesh.faceNormals.length / 3} | vertices ${mesh.positions.length / 3}`,
  ].join("\n");
}

function pointerToArcball(clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;
  return [x, y];
}

function getSpawnPosition(baseScale: number, meshRadius: number): Vec3 {
  if (objects.length === 0) {
    return [0, 0, 0];
  }

  const radius = meshRadius * baseScale;
  const gap = 1.4;
  const placeToRight = objects.length % 2 === 1;

  if (placeToRight) {
    const rightEdge = Math.max(...objects.map((object) => object.position[0] + getObjectWorldRadius(object)));
    return [rightEdge + radius + gap, 0, 0];
  }

  const leftEdge = Math.min(...objects.map((object) => object.position[0] - getObjectWorldRadius(object)));
  return [leftEdge - radius - gap, 0, 0];
}

function getObjectWorldRadius(object: SceneObject): number {
  return object.mesh.bounds.radius * object.baseScale * object.scale;
}

function computeSceneStats(): { center: Vec3; radius: number } {
  if (objects.length === 0) {
    return { center: [0, 0, 0], radius: 2 };
  }

  let sum: Vec3 = [0, 0, 0];
  for (const object of objects) {
    sum = vec3.add(sum, object.position);
  }

  const center = vec3.scale(sum, 1 / objects.length);
  let radius = 1;
  for (const object of objects) {
    radius = Math.max(
      radius,
      vec3.distance(object.position, center) + object.mesh.bounds.radius * object.baseScale * object.scale,
    );
  }

  return { center, radius };
}

function getCameraDistance(sceneRadius: number): number {
  return Math.max(4.2, sceneRadius * 2.7 * settings.zoom);
}

function getAnimatedLightPosition(sceneCenter: Vec3): Vec3 {
  if (!settings.autoRotateLight || settings.followCameraLight) {
    return settings.lightPosition;
  }

  const orbitRadius = Math.max(1.5, Math.hypot(settings.lightPosition[0], settings.lightPosition[2]));
  const angle = performance.now() * 0.001;
  return [
    sceneCenter[0] + Math.cos(angle) * orbitRadius,
    settings.lightPosition[1],
    sceneCenter[2] + Math.sin(angle) * orbitRadius,
  ];
}

function createProceduralTexture(deviceRef: GPUDevice, mode: Exclude<TextureMode, "uploaded">): TextureRecord {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create procedural texture canvas.");
  }

  if (mode === "uv") {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#34d399");
    gradient.addColorStop(1, "#ef4444");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * size;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px Segoe UI";
    ctx.fillText("U", 24, 62);
    ctx.fillText("V", size - 58, size - 20);
  } else if (mode === "checker") {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#f8fafc" : "#0f172a";
        ctx.fillRect((x * size) / 16, (y * size) / 16, size / 16, size / 16);
      }
    }
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#38bdf8" : "#fb923c";
      ctx.fillRect((i * size) / 12, 0, size / 12, size);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  const texture = deviceRef.createTexture({
    size: [size, size, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  deviceRef.queue.writeTexture(
    { texture },
    imageData.data,
    { bytesPerRow: size * 4 },
    [size, size, 1],
  );

  return { texture, view: texture.createView() };
}

function createTextureFromBitmap(deviceRef: GPUDevice, bitmap: ImageBitmap): TextureRecord {
  const texture = deviceRef.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  deviceRef.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    [bitmap.width, bitmap.height],
  );
  return { texture, view: texture.createView() };
}

function paletteColor(index: number): Vec3 {
  const palette: Vec3[] = [
    [0.95, 0.82, 0.38],
    [0.45, 0.72, 0.98],
    [0.78, 0.53, 0.92],
    [0.39, 0.87, 0.65],
  ];
  return palette[index % palette.length];
}

function hexToRgb(value: string): Vec3 {
  const normalized = value.replace("#", "");
  const int = Number.parseInt(normalized, 16);
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
}

function rgbToHex(color: Vec3): string {
  const parts = color.map((channel) => {
    const value = clamp(Math.round(channel * 255), 0, 255);
    return value.toString(16).padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

function formatVec(value: Vec3): string {
  return `(${value[0].toFixed(2)}, ${value[1].toFixed(2)}, ${value[2].toFixed(2)})`;
}
