import { clamp, quat, type Quat, type Vec3, vec3 } from "./math3d";

function projectToArcball(x: number, y: number): Vec3 {
  const lengthSquared = x * x + y * y;
  if (lengthSquared <= 1) {
    return [x, y, Math.sqrt(1 - lengthSquared)];
  }

  const scale = 1 / Math.sqrt(lengthSquared);
  return [x * scale, y * scale, 0];
}

export function dragToArcballRotation(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Quat {
  const from = projectToArcball(startX, clamp(startY, -1, 1));
  const to = projectToArcball(endX, clamp(endY, -1, 1));
  const axis = vec3.cross(from, to);
  const axisLength = vec3.length(axis);

  if (axisLength < 1e-5) {
    return quat.identity();
  }

  const dot = clamp(vec3.dot(from, to), -1, 1);
  const angle = Math.acos(dot);
  return quat.fromAxisAngle(vec3.scale(axis, 1 / axisLength), angle);
}
