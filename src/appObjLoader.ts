import type { Vec2, Vec3 } from "./math3d";
import { createMeshData, type MeshData } from "./appMesh";

interface OBJVertexRef {
  v: number;
  vt: number | null;
  vn: number | null;
}

function parseOBJIndex(value: string, arrayLength: number): number {
  const idx = Number.parseInt(value, 10);
  if (!Number.isFinite(idx)) {
    throw new Error(`Invalid OBJ index: ${value}`);
  }
  return idx > 0 ? idx - 1 : arrayLength + idx;
}

export function loadOBJFromText(name: string, objText: string): MeshData {
  const sourcePositions: Vec3[] = [];
  const sourceUVs: Vec2[] = [];
  const sourceNormals: Vec3[] = [];

  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  const lines = objText.split(/\r?\n/);

  function getOrCreateVertex(ref: OBJVertexRef): number {
    const key = `${ref.v}/${ref.vt ?? ""}/${ref.vn ?? ""}`;
    const cached = vertexMap.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const pos = sourcePositions[ref.v];
    if (!pos) {
      throw new Error(`OBJ vertex index out of range: ${ref.v}`);
    }

    positions.push(pos[0], pos[1], pos[2]);

    const uv = ref.vt !== null ? sourceUVs[ref.vt] : undefined;
    if (uv) {
      uvs.push(uv[0], uv[1]);
    } else {
      uvs.push(0, 0);
    }

    const normal = ref.vn !== null ? sourceNormals[ref.vn] : undefined;
    if (normal) {
      normals.push(normal[0], normal[1], normal[2]);
    } else {
      normals.push(0, 0, 0);
    }

    const nextIndex = positions.length / 3 - 1;
    vertexMap.set(key, nextIndex);
    return nextIndex;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const parts = line.split(/\s+/);
    const command = parts[0];

    if (command === "v" && parts.length >= 4) {
      sourcePositions.push([
        Number.parseFloat(parts[1]),
        Number.parseFloat(parts[2]),
        Number.parseFloat(parts[3]),
      ]);
    } else if (command === "vt" && parts.length >= 3) {
      sourceUVs.push([
        Number.parseFloat(parts[1]),
        Number.parseFloat(parts[2]),
      ]);
    } else if (command === "vn" && parts.length >= 4) {
      sourceNormals.push([
        Number.parseFloat(parts[1]),
        Number.parseFloat(parts[2]),
        Number.parseFloat(parts[3]),
      ]);
    } else if (command === "f" && parts.length >= 4) {
      const refs = parts.slice(1).map<OBJVertexRef>((token) => {
        const [v, vt, vn] = token.split("/");
        return {
          v: parseOBJIndex(v, sourcePositions.length),
          vt: vt ? parseOBJIndex(vt, sourceUVs.length) : null,
          vn: vn ? parseOBJIndex(vn, sourceNormals.length) : null,
        };
      });

      for (let i = 1; i < refs.length - 1; i++) {
        indices.push(
          getOrCreateVertex(refs[0]),
          getOrCreateVertex(refs[i]),
          getOrCreateVertex(refs[i + 1]),
        );
      }
    }
  }

  return createMeshData(
    name,
    new Float32Array(positions),
    new Uint32Array(indices),
    new Float32Array(uvs),
    sourceNormals.length > 0 ? new Float32Array(normals) : undefined,
  );
}
