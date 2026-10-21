import type { Mat4 } from "./mat4.js";
import type { Quat } from "./quat.js";

/** Plain 3D vector. Everything in the library accepts any object with x, y and z. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Every function writes into `out` and returns it, so hot code can reuse scratch
// vectors instead of allocating. `out` may alias any of the inputs.

export function create(x: number = 0, y: number = 0, z: number = 0): Vec3 {
  return { x, y, z };
}

export function clone(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** out = a + b * s */
export function scaleAndAdd(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function negate(out: Vec3, a: Vec3): Vec3 {
  out.x = -a.x;
  out.y = -a.y;
  out.z = -a.z;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function distanceSq(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return dx * dx + dy * dy + dz * dz;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSq(a, b));
}

/** Unit vector in the direction of `a`. A zero vector stays zero instead of becoming NaN. */
export function normalize(out: Vec3, a: Vec3): Vec3 {
  const len = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  const inv = len > 0 ? 1 / len : 0;
  out.x = a.x * inv;
  out.y = a.y * inv;
  out.z = a.z * inv;
  return out;
}

export function lerp(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/** Transforms a point (w = 1) by an affine matrix. */
export function transformMat4(out: Vec3, a: Vec3, m: Mat4): Vec3 {
  const x = a.x;
  const y = a.y;
  const z = a.z;
  out.x = m[0] * x + m[4] * y + m[8] * z + m[12];
  out.y = m[1] * x + m[5] * y + m[9] * z + m[13];
  out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

/** Transforms a direction (w = 0): rotation and scale only, no translation. */
export function transformMat4Direction(out: Vec3, a: Vec3, m: Mat4): Vec3 {
  const x = a.x;
  const y = a.y;
  const z = a.z;
  out.x = m[0] * x + m[4] * y + m[8] * z;
  out.y = m[1] * x + m[5] * y + m[9] * z;
  out.z = m[2] * x + m[6] * y + m[10] * z;
  return out;
}

export function transformQuat(out: Vec3, a: Vec3, q: Quat): Vec3 {
  const qx = q[0];
  const qy = q[1];
  const qz = q[2];
  const qw = q[3];
  // t = 2 * cross(q.xyz, a)
  const tx = 2 * (qy * a.z - qz * a.y);
  const ty = 2 * (qz * a.x - qx * a.z);
  const tz = 2 * (qx * a.y - qy * a.x);
  // a + w * t + cross(q.xyz, t)
  const x = a.x + qw * tx + (qy * tz - qz * ty);
  const y = a.y + qw * ty + (qz * tx - qx * tz);
  const z = a.z + qw * tz + (qx * ty - qy * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function equals(a: Vec3, b: Vec3, eps: number = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}
