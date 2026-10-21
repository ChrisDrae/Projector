import type { Quat } from "./quat.js";
import type { Vec3 } from "./vec3.js";

/** 4x4 matrix, column-major (m[column * 4 + row]), like WebGL. */
export type Mat4 = Float64Array;

export function create(): Mat4 {
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function copy(out: Mat4, a: Mat4): Mat4 {
  out.set(a);
  return out;
}

/** out = a * b (applies b first, then a). `out` may alias either input. */
export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a10 = a[1], a20 = a[2], a30 = a[3];
  const a01 = a[4], a11 = a[5], a21 = a[6], a31 = a[7];
  const a02 = a[8], a12 = a[9], a22 = a[10], a32 = a[11];
  const a03 = a[12], a13 = a[13], a23 = a[14], a33 = a[15];

  for (let c = 0; c < 16; c += 4) {
    const b0 = b[c];
    const b1 = b[c + 1];
    const b2 = b[c + 2];
    const b3 = b[c + 3];
    out[c] = a00 * b0 + a01 * b1 + a02 * b2 + a03 * b3;
    out[c + 1] = a10 * b0 + a11 * b1 + a12 * b2 + a13 * b3;
    out[c + 2] = a20 * b0 + a21 * b1 + a22 * b2 + a23 * b3;
    out[c + 3] = a30 * b0 + a31 * b1 + a32 * b2 + a33 * b3;
  }
  return out;
}

/** General inverse. Returns null when the matrix is singular. */
export function invert(out: Mat4, a: Mat4): Mat4 | null {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/** Model matrix: scale, then rotate, then translate. */
export function compose(out: Mat4, q: Quat, position: Vec3, scale: Vec3): Mat4 {
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = scale.x;
  const sy = scale.y;
  const sz = scale.z;

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = position.x;
  out[13] = position.y;
  out[14] = position.z;
  out[15] = 1;
  return out;
}

/**
 * Left-handed view matrix: the camera sits at `eye` and looks along +z towards `target`.
 * After this transform, view-space x is right, y is up and z is the distance in front of the camera.
 */
export function lookAtLH(out: Mat4, eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  let fx = target.x - eye.x;
  let fy = target.y - eye.y;
  let fz = target.z - eye.z;
  let len = Math.hypot(fx, fy, fz) || 1;
  fx /= len;
  fy /= len;
  fz /= len;

  // right = up x forward (falls back to another up vector when looking straight up or down)
  let rx = up.y * fz - up.z * fy;
  let ry = up.z * fx - up.x * fz;
  let rz = up.x * fy - up.y * fx;
  len = Math.hypot(rx, ry, rz);
  if (len < 1e-9) {
    rx = fz;
    ry = 0;
    rz = -fx;
    len = Math.hypot(rx, ry, rz) || 1;
    if (len < 1e-9) {
      rx = 1;
      len = 1;
    }
  }
  rx /= len;
  ry /= len;
  rz /= len;

  // up' = forward x right
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;

  out[0] = rx;
  out[1] = ux;
  out[2] = fx;
  out[3] = 0;
  out[4] = ry;
  out[5] = uy;
  out[6] = fy;
  out[7] = 0;
  out[8] = rz;
  out[9] = uz;
  out[10] = fz;
  out[11] = 0;
  out[12] = -(rx * eye.x + ry * eye.y + rz * eye.z);
  out[13] = -(ux * eye.x + uy * eye.y + uz * eye.z);
  out[14] = -(fx * eye.x + fy * eye.y + fz * eye.z);
  out[15] = 1;
  return out;
}

/** Left-handed perspective projection to WebGL clip space (NDC z in [-1, 1]). Used by GPU backends. */
export function perspectiveLH(out: Mat4, fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (far - near);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = 1;
  out[14] = -2 * far * near * nf;
  return out;
}

/** Transforms a point (w = 1) and writes it into `out`. */
export function transformPoint(out: Vec3, m: Mat4, p: Vec3): Vec3 {
  const x = p.x;
  const y = p.y;
  const z = p.z;
  out.x = m[0] * x + m[4] * y + m[8] * z + m[12];
  out.y = m[1] * x + m[5] * y + m[9] * z + m[13];
  out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}
