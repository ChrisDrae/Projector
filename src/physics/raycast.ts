import type { Vec3 } from "../math/vec3.js";

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
