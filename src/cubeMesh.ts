import type { MeshData, Bounds } from "./mesh";

function createCubeBounds(): Bounds {
  return {
    min: [-1, -1, -1],
    max: [1, 1, 1],
    center: [0, 0, 0],
    radius: Math.sqrt(3),
  };
}

export function createCubeMesh(): MeshData {
  const positions = new Float32Array([
    // Front
    -1, -1,  1,
     1, -1,  1,
     1,  1,  1,
    -1,  1,  1,

    // Back
     1, -1, -1,
    -1, -1, -1,
    -1,  1, -1,
     1,  1, -1,

    // Left
    -1, -1, -1,
    -1, -1,  1,
    -1,  1,  1,
    -1,  1, -1,

    // Right
     1, -1,  1,
     1, -1, -1,
     1,  1, -1,
     1,  1,  1,

    // Top
    -1,  1,  1,
     1,  1,  1,
     1,  1, -1,
    -1,  1, -1,

    // Bottom
    -1, -1, -1,
     1, -1, -1,
     1, -1,  1,
    -1, -1,  1,
  ]);

  const normals = new Float32Array([
    // Front
     0,  0,  1,
     0,  0,  1,
     0,  0,  1,
     0,  0,  1,

    // Back
     0,  0, -1,
     0,  0, -1,
     0,  0, -1,
     0,  0, -1,

    // Left
    -1,  0,  0,
    -1,  0,  0,
    -1,  0,  0,
    -1,  0,  0,

    // Right
     1,  0,  0,
     1,  0,  0,
     1,  0,  0,
     1,  0,  0,

    // Top
     0,  1,  0,
     0,  1,  0,
     0,  1,  0,
     0,  1,  0,

    // Bottom
     0, -1,  0,
     0, -1,  0,
     0, -1,  0,
     0, -1,  0,
  ]);

  const uvs = new Float32Array([
    // Front
    0, 1,
    1, 1,
    1, 0,
    0, 0,

    // Back
    0, 1,
    1, 1,
    1, 0,
    0, 0,

    // Left
    0, 1,
    1, 1,
    1, 0,
    0, 0,

    // Right
    0, 1,
    1, 1,
    1, 0,
    0, 0,

    // Top
    0, 1,
    1, 1,
    1, 0,
    0, 0,

    // Bottom
    0, 1,
    1, 1,
    1, 0,
    0, 0,
  ]);

  const indices = new Uint32Array([
    // Front
    0, 1, 2,
    0, 2, 3,

    // Back
    4, 5, 6,
    4, 6, 7,

    // Left
    8, 9, 10,
    8, 10, 11,

    // Right
    12, 13, 14,
    12, 14, 15,

    // Top
    16, 17, 18,
    16, 18, 19,

    // Bottom
    20, 21, 22,
    20, 22, 23,
  ]);

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds: createCubeBounds(),
  };
}