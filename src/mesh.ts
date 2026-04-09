export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  radius: number;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  bounds: Bounds;
}