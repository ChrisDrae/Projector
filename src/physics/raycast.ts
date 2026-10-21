import type { Vec3 } from "../math/vec3.js";
import type { RigidBodyStore } from "./rigid/rigidStore.js";
import { ShapeType } from "./rigid/shapes.js";

/**
 * Distance along a ray (unit direction d from o) to where it enters a sphere, or -1 if it misses.
 * A ray starting inside reports 0.
 */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
): number {
  const mx = ox - cx;
  const my = oy - cy;
  const mz = oz - cz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c <= 0) return 0;
  const b = mx * dx + my * dy + mz * dz;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b - Math.sqrt(disc);
}

/** Distance along a ray to the plane dot(n, p) = offset, hit from its front side only, or -1. */
export function rayPlane(o: Vec3, d: Vec3, n: Vec3, offset: number): number {
  const denom = n.x * d.x + n.y * d.y + n.z * d.z;
  if (denom >= 0) return -1;
  const t = (offset - (n.x * o.x + n.y * o.y + n.z * o.z)) / denom;
  return t >= 0 ? t : -1;
}

const local = new Float64Array(6);

/**
 * Distance along a ray (unit d from o) to rigid body i of `s`, writing the surface normal to `normal`,
 * or -1 for a miss. Boxes are hit by a slab test in their own frame, capsules as a cylinder with caps.
 */
export function rayRigid(s: RigidBodyStore, i: number, o: Vec3, d: Vec3, normal: Vec3): number {
  const p = s.pos;
  const cx = p[i * 3];
  const cy = p[i * 3 + 1];
  const cz = p[i * 3 + 2];
  // Cheap reject with the bounding sphere first
  if (raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, cy, cz, s.radius[i]) < 0) return -1;
  const type = s.shape[i];
  if (type === ShapeType.Sphere) {
    const r = s.dims[i * 3];
    const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, cy, cz, r);
    if (t >= 0) setNormal(normal, (o.x + d.x * t - cx) / r, (o.y + d.y * t - cy) / r, (o.z + d.z * t - cz) / r);
    return t;
  }
  // Into the body frame: R^T (o - c), R^T d
  const q = s.quat;
  const qx = -q[i * 4];
  const qy = -q[i * 4 + 1];
  const qz = -q[i * 4 + 2];
  const qw = q[i * 4 + 3];
  rotate(qx, qy, qz, qw, o.x - cx, o.y - cy, o.z - cz, local, 0);
  rotate(qx, qy, qz, qw, d.x, d.y, d.z, local, 3);
  const [ox, oy, oz, dx, dy, dz] = local;
  let t = -1;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (type === ShapeType.Box) {
    let near = -Infinity;
    let far = Infinity;
    let axis = -1;
    let sign = 1;
    for (let k = 0; k < 3; k++) {
      const h = s.dims[i * 3 + k];
      const ok = local[k];
      const dk = local[3 + k];
      if (Math.abs(dk) < 1e-12) {
        if (ok < -h || ok > h) return -1;
        continue;
      }
      let t0 = (-h - ok) / dk;
      let t1 = (h - ok) / dk;
      let sg = -1;
      if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
        sg = 1;
      }
      if (t0 > near) {
        near = t0;
        axis = k;
        sign = sg;
      }
      if (t1 < far) far = t1;
      if (near > far || far < 0) return -1;
    }
    if (near < 0) return 0;
    t = near;
    if (axis === 0) nx = sign;
    else if (axis === 1) ny = sign;
    else nz = sign;
  } else {
    // Capsule along local y: the side as a cylinder, the ends as spheres
    const r = s.dims[i * 3];
    const h = s.dims[i * 3 + 1];
    const a = dx * dx + dz * dz;
    if (a > 1e-12) {
      const b = ox * dx + oz * dz;
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - a * c;
      if (disc >= 0) {
        const tc = (-b - Math.sqrt(disc)) / a;
        const y = oy + dy * tc;
        if (tc >= 0 && y >= -h && y <= h) {
          t = tc;
          nx = (ox + dx * tc) / r;
          nz = (oz + dz * tc) / r;
        }
      }
    }
    for (const end of [-h, h]) {
      const te = raySphere(ox, oy, oz, dx, dy, dz, 0, end, 0, r);
      if (te >= 0 && (t < 0 || te < t)) {
        t = te;
        nx = (ox + dx * te) / r;
        ny = (oy + dy * te - end) / r;
        nz = (oz + dz * te) / r;
      }
    }
    if (t < 0) return -1;
  }
  // The normal back to world space
  rotate(-qx, -qy, -qz, qw, nx, ny, nz, local, 0);
  setNormal(normal, local[0], local[1], local[2]);
  return t;
}

function setNormal(n: Vec3, x: number, y: number, z: number): void {
  n.x = x;
  n.y = y;
  n.z = z;
}

/** Rotates (x, y, z) by quaternion (qx, qy, qz, qw) into out[o..o+2]. */
function rotate(qx: number, qy: number, qz: number, qw: number, x: number, y: number, z: number, out: Float64Array, o: number): void {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out[o] = x + qw * tx + (qy * tz - qz * ty);
  out[o + 1] = y + qw * ty + (qz * tx - qx * tz);
  out[o + 2] = z + qw * tz + (qx * ty - qy * tx);
}
