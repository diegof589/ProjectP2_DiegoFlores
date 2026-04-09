export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = Float32Array;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function radToDeg(value: number): number {
  return (value * 180) / Math.PI;
}

export const vec3 = {
  add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },

  sub(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },

  scale(v: Vec3, s: number): Vec3 {
    return [v[0] * s, v[1] * s, v[2] * s];
  },

  multiply(a: Vec3, b: Vec3): Vec3 {
    return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
  },

  dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },

  cross(a: Vec3, b: Vec3): Vec3 {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  },

  length(v: Vec3): number {
    return Math.hypot(v[0], v[1], v[2]);
  },

  normalize(v: Vec3): Vec3 {
    const len = vec3.length(v) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  },

  distance(a: Vec3, b: Vec3): number {
    return vec3.length(vec3.sub(a, b));
  },

  min(a: Vec3, b: Vec3): Vec3 {
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  },

  max(a: Vec3, b: Vec3): Vec3 {
    return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  },

  transformPoint(v: Vec3, m: Mat4): Vec3 {
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    return [
      (x * m[0] + y * m[4] + z * m[8] + m[12]) / w,
      (x * m[1] + y * m[5] + z * m[9] + m[13]) / w,
      (x * m[2] + y * m[6] + z * m[10] + m[14]) / w,
    ];
  },

  transformDirection(v: Vec3, m: Mat4): Vec3 {
    const x = v[0];
    const y = v[1];
    const z = v[2];
    return [
      x * m[0] + y * m[4] + z * m[8],
      x * m[1] + y * m[5] + z * m[9],
      x * m[2] + y * m[6] + z * m[10],
    ];
  },
};

export const quat = {
  identity(): Quat {
    return [0, 0, 0, 1];
  },

  normalize(q: Quat): Quat {
    const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
  },

  multiply(a: Quat, b: Quat): Quat {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },

  conjugate(q: Quat): Quat {
    return [-q[0], -q[1], -q[2], q[3]];
  },

  fromAxisAngle(axis: Vec3, radians: number): Quat {
    const n = vec3.normalize(axis);
    const half = radians * 0.5;
    const s = Math.sin(half);
    return quat.normalize([n[0] * s, n[1] * s, n[2] * s, Math.cos(half)]);
  },

  rotateVector(q: Quat, v: Vec3): Vec3 {
    const p: Quat = [v[0], v[1], v[2], 0];
    const rotated = quat.multiply(quat.multiply(q, p), quat.conjugate(q));
    return [rotated[0], rotated[1], rotated[2]];
  },

  fromEulerDegrees(euler: Vec3): Quat {
    const ex = degToRad(euler[0]) * 0.5;
    const ey = degToRad(euler[1]) * 0.5;
    const ez = degToRad(euler[2]) * 0.5;

    const sx = Math.sin(ex);
    const cx = Math.cos(ex);
    const sy = Math.sin(ey);
    const cy = Math.cos(ey);
    const sz = Math.sin(ez);
    const cz = Math.cos(ez);

    return quat.normalize([
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz,
    ]);
  },

  toEulerDegrees(q: Quat): Vec3 {
    const [x, y, z, w] = quat.normalize(q);
    const sinrCosp = 2 * (w * x + y * z);
    const cosrCosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinrCosp, cosrCosp);

    const sinp = 2 * (w * y - z * x);
    const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI * 0.5 : Math.asin(sinp);

    const sinyCosp = 2 * (w * z + x * y);
    const cosyCosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(sinyCosp, cosyCosp);

    return [radToDeg(roll), radToDeg(pitch), radToDeg(yaw)];
  },
};

export const mat4 = {
  identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = 1;
    m[5] = 1;
    m[10] = 1;
    m[15] = 1;
    return m;
  },

  multiply(a: Mat4, b: Mat4): Mat4 {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  },

  transpose(a: Mat4): Mat4 {
    const out = new Float32Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        out[c * 4 + r] = a[r * 4 + c];
      }
    }
    return out;
  },

  invert(m: Mat4): Mat4 {
    const out = new Float32Array(16);
    const
      a00 = m[0], a10 = m[1], a20 = m[2], a30 = m[3],
      a01 = m[4], a11 = m[5], a21 = m[6], a31 = m[7],
      a02 = m[8], a12 = m[9], a22 = m[10], a32 = m[11],
      a03 = m[12], a13 = m[13], a23 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a10 * a01;
    const b01 = a00 * a21 - a20 * a01;
    const b02 = a00 * a31 - a30 * a01;
    const b03 = a10 * a21 - a20 * a11;
    const b04 = a10 * a31 - a30 * a11;
    const b05 = a20 * a31 - a30 * a21;
    const b06 = a02 * a13 - a12 * a03;
    const b07 = a02 * a23 - a22 * a03;
    const b08 = a02 * a33 - a32 * a03;
    const b09 = a12 * a23 - a22 * a13;
    const b10 = a12 * a33 - a32 * a13;
    const b11 = a22 * a33 - a32 * a23;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return mat4.identity();
    det = 1 / det;

    out[0] = (a11 * b11 - a21 * b10 + a31 * b09) * det;
    out[1] = (a21 * b08 - a01 * b11 - a31 * b07) * det;
    out[2] = (a01 * b10 - a11 * b08 + a31 * b06) * det;
    out[3] = (a11 * b07 - a01 * b09 - a21 * b06) * det;
    out[4] = (a20 * b10 - a10 * b11 - a30 * b09) * det;
    out[5] = (a00 * b11 - a20 * b08 + a30 * b07) * det;
    out[6] = (a10 * b08 - a00 * b10 - a30 * b06) * det;
    out[7] = (a00 * b09 - a10 * b07 + a20 * b06) * det;
    out[8] = (a13 * b05 - a23 * b04 + a33 * b03) * det;
    out[9] = (a23 * b02 - a03 * b05 - a33 * b01) * det;
    out[10] = (a03 * b04 - a13 * b02 + a33 * b00) * det;
    out[11] = (a13 * b01 - a03 * b03 - a23 * b00) * det;
    out[12] = (a22 * b04 - a12 * b05 - a32 * b03) * det;
    out[13] = (a02 * b05 - a22 * b02 + a32 * b01) * det;
    out[14] = (a12 * b02 - a02 * b04 - a32 * b00) * det;
    out[15] = (a02 * b03 - a12 * b01 + a22 * b00) * det;
    return out;
  },

  normalMatrix(model: Mat4): Mat4 {
    return mat4.transpose(mat4.invert(model));
  },

  translation(tx: number, ty: number, tz: number): Mat4 {
    const m = mat4.identity();
    m[12] = tx;
    m[13] = ty;
    m[14] = tz;
    return m;
  },

  scaling(sx: number, sy: number, sz: number): Mat4 {
    const m = mat4.identity();
    m[0] = sx;
    m[5] = sy;
    m[10] = sz;
    return m;
  },

  fromQuaternion(q: Quat): Mat4 {
    const [x, y, z, w] = quat.normalize(q);
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;

    const m = mat4.identity();
    m[0] = 1 - 2 * (yy + zz);
    m[1] = 2 * (xy + wz);
    m[2] = 2 * (xz - wy);
    m[4] = 2 * (xy - wz);
    m[5] = 1 - 2 * (xx + zz);
    m[6] = 2 * (yz + wx);
    m[8] = 2 * (xz + wy);
    m[9] = 2 * (yz - wx);
    m[10] = 1 - 2 * (xx + yy);
    return m;
  },

  compose(position: Vec3, rotation: Quat, scale: Vec3): Mat4 {
    const t = mat4.translation(position[0], position[1], position[2]);
    const r = mat4.fromQuaternion(rotation);
    const s = mat4.scaling(scale[0], scale[1], scale[2]);
    return mat4.multiply(t, mat4.multiply(r, s));
  },

  perspective(fovyRad: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fovyRad * 0.5);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = far / (near - far);
    m[11] = -1;
    m[14] = (far * near) / (near - far);
    return m;
  },

  lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const z = vec3.normalize(vec3.sub(eye, target));
    const x = vec3.normalize(vec3.cross(up, z));
    const y = vec3.cross(z, x);
    const m = new Float32Array(16);
    m[0] = x[0];
    m[4] = x[1];
    m[8] = x[2];
    m[12] = -vec3.dot(x, eye);
    m[1] = y[0];
    m[5] = y[1];
    m[9] = y[2];
    m[13] = -vec3.dot(y, eye);
    m[2] = z[0];
    m[6] = z[1];
    m[10] = z[2];
    m[14] = -vec3.dot(z, eye);
    m[3] = 0;
    m[7] = 0;
    m[11] = 0;
    m[15] = 1;
    return m;
  },
};
