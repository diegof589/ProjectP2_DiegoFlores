import { clamp, type Vec3, vec3 } from "./math3d";

export interface Bounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  radius: number;
  size: Vec3;
}

export interface MeshData {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  faceNormals: Float32Array;
  bounds: Bounds;
}

export interface RenderGeometry {
  vertices: Float32Array;
  vertexCount: number;
}

export interface NamedBoundsOverride {
  center: Vec3;
  min: Vec3;
  max: Vec3;
  radius: number;
}

export const NAMED_BOUNDS: Record<string, NamedBoundsOverride> = {
  beacon: {
    center: [125, 125, 125],
    min: [0, 0, 0],
    max: [250, 250, 250],
    radius: 125,
  },
  kaust_beacon: {
    center: [125, 125, 125],
    min: [0, 0, 0],
    max: [250, 250, 250],
    radius: 125,
  },
  teapot: {
    center: [0.217, 1.575, 0],
    min: [-3, 0, -2],
    max: [3.434, 3.15, 2],
    radius: Math.max(
      vec3.distance([0.217, 1.575, 0], [-3, 0, -2]),
      vec3.distance([0.217, 1.575, 0], [3.434, 3.15, 2]),
    ),
  },
};

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function computeBounds(positions: Float32Array, name?: string): Bounds {
  const override = name ? NAMED_BOUNDS[normalizeName(name)] : undefined;
  if (override) {
    return {
      min: override.min,
      max: override.max,
      center: override.center,
      radius: override.radius,
      size: vec3.sub(override.max, override.min),
    };
  }

  if (positions.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 0,
      size: [0, 0, 0],
    };
  }

  let min: Vec3 = [positions[0], positions[1], positions[2]];
  let max: Vec3 = [positions[0], positions[1], positions[2]];

  for (let i = 3; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    min = vec3.min(min, p);
    max = vec3.max(max, p);
  }

  const center: Vec3 = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ];

  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const p: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    radius = Math.max(radius, vec3.distance(p, center));
  }

  return {
    min,
    max,
    center,
    radius,
    size: vec3.sub(max, min),
  };
}

export function computeFaceNormals(
  positions: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const out = new Float32Array(indices.length);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;

    const a: Vec3 = [positions[ia], positions[ia + 1], positions[ia + 2]];
    const b: Vec3 = [positions[ib], positions[ib + 1], positions[ib + 2]];
    const c: Vec3 = [positions[ic], positions[ic + 1], positions[ic + 2]];

    const ab = vec3.sub(b, a);
    const ac = vec3.sub(c, a);
    const n = vec3.normalize(vec3.cross(ab, ac));

    out[i] = n[0];
    out[i + 1] = n[1];
    out[i + 2] = n[2];
  }

  return out;
}

export function computeVertexNormals(
  positions: Float32Array,
  indices: Uint32Array,
  faceNormals: Float32Array,
): Float32Array {
  const out = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const nx = faceNormals[i];
    const ny = faceNormals[i + 1];
    const nz = faceNormals[i + 2];

    for (let j = 0; j < 3; j++) {
      const idx = indices[i + j] * 3;
      out[idx] += nx;
      out[idx + 1] += ny;
      out[idx + 2] += nz;
    }
  }

  for (let i = 0; i < out.length; i += 3) {
    const n = vec3.normalize([out[i], out[i + 1], out[i + 2]]);
    out[i] = n[0];
    out[i + 1] = n[1];
    out[i + 2] = n[2];
  }

  return out;
}

export function generateSphericalUVs(
  positions: Float32Array,
  center: Vec3,
): Float32Array {
  const out = new Float32Array((positions.length / 3) * 2);

  for (let i = 0; i < positions.length; i += 3) {
    const p = vec3.normalize([
      positions[i] - center[0],
      positions[i + 1] - center[1],
      positions[i + 2] - center[2],
    ]);

    const u = 0.5 + Math.atan2(p[2], p[0]) / (2 * Math.PI);
    const v = 0.5 - Math.asin(clamp(p[1], -1, 1)) / Math.PI;
    const uvIndex = (i / 3) * 2;
    out[uvIndex] = u;
    out[uvIndex + 1] = v;
  }

  return out;
}

export function ensureUVs(mesh: MeshData, spherical = false): MeshData {
  const hasAnyUV = mesh.uvs.some((value) => value !== 0);
  const uvs = spherical || !hasAnyUV
    ? generateSphericalUVs(mesh.positions, mesh.bounds.center)
    : mesh.uvs;

  return {
    ...mesh,
    uvs,
  };
}

export function buildRenderGeometry(mesh: MeshData): RenderGeometry {
  const stride = 11;
  const vertices = new Float32Array(mesh.indices.length * stride);
  const barycentrics: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let tri = 0; tri < mesh.indices.length; tri += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = mesh.indices[tri + corner];
      const positionIndex = vertexIndex * 3;
      const normalIndex = vertexIndex * 3;
      const uvIndex = vertexIndex * 2;
      const outIndex = (tri + corner) * stride;
      const bary = barycentrics[corner];

      vertices[outIndex] = mesh.positions[positionIndex];
      vertices[outIndex + 1] = mesh.positions[positionIndex + 1];
      vertices[outIndex + 2] = mesh.positions[positionIndex + 2];
      vertices[outIndex + 3] = mesh.normals[normalIndex];
      vertices[outIndex + 4] = mesh.normals[normalIndex + 1];
      vertices[outIndex + 5] = mesh.normals[normalIndex + 2];
      vertices[outIndex + 6] = mesh.uvs[uvIndex];
      vertices[outIndex + 7] = mesh.uvs[uvIndex + 1];
      vertices[outIndex + 8] = bary[0];
      vertices[outIndex + 9] = bary[1];
      vertices[outIndex + 10] = bary[2];
    }
  }

  return {
    vertices,
    vertexCount: mesh.indices.length,
  };
}

export function createMeshData(
  name: string,
  positions: Float32Array,
  indices: Uint32Array,
  uvs?: Float32Array,
  normalsOverride?: Float32Array,
): MeshData {
  const bounds = computeBounds(positions, name);
  const faceNormals = computeFaceNormals(positions, indices);
  const normals = normalsOverride && normalsOverride.length === positions.length
    ? normalsOverride
    : computeVertexNormals(positions, indices, faceNormals);
  const finalUVs = uvs && uvs.length === (positions.length / 3) * 2
    ? uvs
    : generateSphericalUVs(positions, bounds.center);

  return {
    name,
    positions,
    normals,
    uvs: finalUVs,
    indices,
    faceNormals,
    bounds,
  };
}

export function createCubeMesh(name = "cube"): MeshData {
  const positions = new Float32Array([
    -1, -1, 1,
    1, -1, 1,
    1, 1, 1,
    -1, 1, 1,
    -1, -1, -1,
    1, -1, -1,
    1, 1, -1,
    -1, 1, -1,
  ]);

  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    5, 4, 7, 5, 7, 6,
    4, 0, 3, 4, 3, 7,
    1, 5, 6, 1, 6, 2,
    3, 2, 6, 3, 6, 7,
    4, 5, 1, 4, 1, 0,
  ]);

  const bounds = computeBounds(positions, name);
  const uvs = generateSphericalUVs(positions, bounds.center);
  return createMeshData(name, positions, indices, uvs);
}

export function createSphereMesh(
  name = "sphere",
  segments = 24,
  rings = 16,
): MeshData {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      positions.push(
        sinTheta * cosPhi,
        cosTheta,
        sinTheta * sinPhi,
      );
      uvs.push(u, v);
    }
  }

  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const row = y * (segments + 1);
      const nextRow = (y + 1) * (segments + 1);

      const a = row + x;
      const b = row + x + 1;
      const c = nextRow + x;
      const d = nextRow + x + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return createMeshData(
    name,
    new Float32Array(positions),
    new Uint32Array(indices),
    new Float32Array(uvs),
  );
}
