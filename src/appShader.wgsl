struct Uniforms {
  viewProj: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMat: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightPos: vec4<f32>,
  lightDir: vec4<f32>,
  lightColor: vec4<f32>,
  objectColor: vec4<f32>,
  material: vec4<f32>,
  flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var meshSampler: sampler;
@group(0) @binding(2) var meshTexture: texture_2d<f32>;

struct VSIn {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) bary: vec3<f32>,
};

struct VSOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) bary: vec3<f32>,
  @location(4) gouraudLight: vec3<f32>,
};

struct FSOut {
  @location(0) color: vec4<f32>,
  @location(1) normalBuffer: vec4<f32>,
};

fn lightingTerms(worldNormal: vec3<f32>, worldPos: vec3<f32>) -> vec3<f32> {
  let N = normalize(worldNormal);
  let V = normalize(u.cameraPos.xyz - worldPos);
  let isDirectional = u.flags.z > 0.5;
  let L = normalize(select(u.lightPos.xyz - worldPos, -u.lightDir.xyz, isDirectional));
  let ambient = vec3<f32>(u.material.x);
  let diff = max(dot(N, L), 0.0);
  let diffuse = vec3<f32>(u.material.y * diff);

  var specular = vec3<f32>(0.0);
  if (diff > 0.0) {
    let R = reflect(-L, N);
    let spec = pow(max(dot(R, V), 0.0), max(1.0, u.material.w));
    specular = vec3<f32>(u.material.z * spec);
  }

  return (ambient + diffuse + specular) * u.lightColor.xyz * u.flags.w;
}

fn encodeNormal(normal: vec3<f32>) -> vec3<f32> {
  return normal * 0.5 + vec3<f32>(0.5);
}

fn edgeMask(bary: vec3<f32>) -> f32 {
  let width = fwidth(bary) * 1.4;
  let edgeBlend = smoothstep(vec3<f32>(0.0), width, bary);
  return 1.0 - min(min(edgeBlend.x, edgeBlend.y), edgeBlend.z);
}

fn flatLighting(worldPos: vec3<f32>) -> vec3<f32> {
  let dx = dpdx(worldPos);
  let dy = dpdy(worldPos);
  let faceNormal = normalize(cross(dx, dy));
  return lightingTerms(faceNormal, worldPos);
}

@vertex
fn vs_main(input: VSIn) -> VSOut {
  var out: VSOut;
  let worldPos = u.model * vec4<f32>(input.position, 1.0);
  let worldNormal = normalize((u.normalMat * vec4<f32>(input.normal, 0.0)).xyz);

  out.clipPos = u.viewProj * worldPos;
  out.worldPos = worldPos.xyz;
  out.worldNormal = worldNormal;
  out.uv = input.uv;
  out.bary = input.bary;
  out.gouraudLight = lightingTerms(worldNormal, worldPos.xyz);
  return out;
}

@fragment
fn fs_main(input: VSOut) -> FSOut {
  var out: FSOut;
  let encodedNormal = encodeNormal(normalize(input.worldNormal));
  let albedo = textureSample(meshTexture, meshSampler, input.uv).rgb * u.objectColor.rgb;
  let flat = flatLighting(input.worldPos) * albedo;
  let gouraud = input.gouraudLight * albedo;
  let phong = lightingTerms(input.worldNormal, input.worldPos) * albedo;
  let shadingMode = u.flags.x;
  let displayMode = u.flags.y;
  let edge = edgeMask(input.bary);

  var color = flat;
  if (shadingMode > 1.5) {
    color = phong;
  } else if (shadingMode > 0.5) {
    color = gouraud;
  }

  if (displayMode > 2.5) {
    color = encodedNormal;
  } else if (displayMode > 1.5) {
    color = mix(vec3<f32>(0.03, 0.05, 0.08), vec3<f32>(0.96, 0.7, 0.24), edge);
  } else if (displayMode > 0.5) {
    color = mix(color, vec3<f32>(0.98, 0.72, 0.28), edge);
  }

  out.color = vec4<f32>(color, 1.0);
  out.normalBuffer = vec4<f32>(encodedNormal, 1.0);
  return out;
}
