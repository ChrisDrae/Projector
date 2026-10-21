import type { Vec3 } from "./vec3.js";

/** Rotation quaternion stored as [x, y, z, w]. */
export type Quat = Float64Array;

export function create(): Quat {
  const q = new Float64Array(4);
  q[3] = 1;
  return q;
}

export function fromValues(x: number, y: number, z: number, w: number): Quat {
  const q = new Float64Array(4);
  q[0] = x;
  q[1] = y;
  q[2] = z;
  q[3] = w;
  return q;
}

export function clone(a: Quat): Quat {
  return new Float64Array(a);
}

export function copy(out: Quat, a: Quat): Quat {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}

export function identity(out: Quat): Quat {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  return out;
}

/** Rotation of `rad` radians around `axis` (right-hand rule). The axis does not need to be normalized. */
export function setAxisAngle(out: Quat, axis: Vec3, rad: number): Quat {
  const len = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  if (len === 0) return identity(out);
  const s = Math.sin(rad / 2) / len;
  out[0] = axis.x * s;
  out[1] = axis.y * s;
  out[2] = axis.z * s;
  out[3] = Math.cos(rad / 2);
  return out;
}

/** Hamilton product a * b: the combined rotation applies b first, then a. */
export function multiply(out: Quat, a: Quat, b: Quat): Quat {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function normalize(out: Quat, a: Quat): Quat {
  const len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]);
  if (len === 0) return identity(out);
  const inv = 1 / len;
  out[0] = a[0] * inv;
  out[1] = a[1] * inv;
  out[2] = a[2] * inv;
  out[3] = a[3] * inv;
  return out;
}

/** Inverse rotation (for unit quaternions). */
export function conjugate(out: Quat, a: Quat): Quat {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  out[3] = a[3];
  return out;
}

/** Rotation around the world axes: Z first, then Y, then X. */
export function fromEuler(out: Quat, x: number, y: number, z: number): Quat {
  const sx = Math.sin(x / 2);
  const cx = Math.cos(x / 2);
  const sy = Math.sin(y / 2);
  const cy = Math.cos(y / 2);
  const sz = Math.sin(z / 2);
  const cz = Math.cos(z / 2);
  // qX * qY * qZ
  out[0] = sx * cy * cz + cx * sy * sz;
  out[1] = cx * sy * cz - sx * cy * sz;
  out[2] = cx * cy * sz + sx * sy * cz;
  out[3] = cx * cy * cz - sx * sy * sz;
  return out;
}

/** Rotation whose matrix has the given orthonormal columns (local x, y and z axes in world space). */
export function fromBasis(out: Quat, xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Quat {
  const m00 = xAxis.x;
  const m10 = xAxis.y;
  const m20 = xAxis.z;
  const m01 = yAxis.x;
  const m11 = yAxis.y;
  const m21 = yAxis.z;
  const m02 = zAxis.x;
  const m12 = zAxis.y;
  const m22 = zAxis.z;
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out[3] = 0.25 / s;
    out[0] = (m21 - m12) * s;
    out[1] = (m02 - m20) * s;
    out[2] = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    out[3] = (m21 - m12) / s;
    out[0] = 0.25 * s;
    out[1] = (m01 + m10) / s;
    out[2] = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    out[3] = (m02 - m20) / s;
    out[0] = (m01 + m10) / s;
    out[1] = 0.25 * s;
    out[2] = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    out[3] = (m10 - m01) / s;
    out[0] = (m02 + m20) / s;
    out[1] = (m12 + m21) / s;
    out[2] = 0.25 * s;
  }
  return normalize(out, out);
}

export function rotateVec3(out: Vec3, q: Quat, v: Vec3): Vec3 {
  const qx = q[0];
  const qy = q[1];
  const qz = q[2];
  const qw = q[3];
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  const x = v.x + qw * tx + (qy * tz - qz * ty);
  const y = v.y + qw * ty + (qz * tx - qx * tz);
  const z = v.z + qw * tz + (qx * ty - qy * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

const tmp: Quat = create();

/** Advances `q` by the world-space angular velocity `omega` (rad/s) over `dt`, renormalized so it never drifts. */
export function integrate(out: Quat, q: Quat, omega: Vec3, dt: number): Quat {
  const w = Math.sqrt(omega.x * omega.x + omega.y * omega.y + omega.z * omega.z);
  if (w * dt < 1e-12) return copy(out, q);
  setAxisAngle(tmp, omega, w * dt);
  multiply(out, tmp, q);
  return normalize(out, out);
}

/** Writes the rotated unit axes (the columns of the rotation matrix). */
export function axes(q: Quat, outX: Vec3, outY: Vec3, outZ: Vec3): void {
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const yy = y * y2;
  const zz = z * z2;
  const xy = x * y2;
  const xz = x * z2;
  const yz = y * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  outX.x = 1 - (yy + zz);
  outX.y = xy + wz;
  outX.z = xz - wy;
  outY.x = xy - wz;
  outY.y = 1 - (xx + zz);
  outY.z = yz + wx;
  outZ.x = xz + wy;
  outZ.y = yz - wx;
  outZ.z = 1 - (xx + yy);
}
