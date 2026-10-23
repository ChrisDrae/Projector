import type { Vec3 } from "../math/vec3.js";

/** FNV-1a, so string seeds work as well as numeric ones. */
function hashSeed(seed: number | string): number {
  if (typeof seed === "number") return Math.floor(seed) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small, fast, seedable PRNG (mulberry32), so simulations can be reproduced. */
export class Random {
  private state: number;

  constructor(seed: number | string = 0) {
    this.state = hashSeed(seed);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max));
  }

  /** Standard normal distribution (Box-Muller). */
  gaussian(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  unitVector(out: Vec3): Vec3 {
    const z = this.range(-1, 1);
    const a = this.range(0, 2 * Math.PI);
    const r = Math.sqrt(1 - z * z);
    out.x = r * Math.cos(a);
    out.y = r * Math.sin(a);
    out.z = z;
    return out;
  }

  /** Uniform point inside an axis-aligned box. */
  inBox(out: Vec3, center: Vec3, halfExtents: number | Vec3): Vec3 {
    const hx = typeof halfExtents === "number" ? halfExtents : halfExtents.x;
    const hy = typeof halfExtents === "number" ? halfExtents : halfExtents.y;
    const hz = typeof halfExtents === "number" ? halfExtents : halfExtents.z;
    out.x = center.x + this.range(-hx, hx);
    out.y = center.y + this.range(-hy, hy);
    out.z = center.z + this.range(-hz, hz);
    return out;
  }

  /** Uniform point inside a ball. */
  inSphere(out: Vec3, center: Vec3, radius: number): Vec3 {
    this.unitVector(out);
    const r = radius * Math.cbrt(this.next());
    out.x = center.x + out.x * r;
    out.y = center.y + out.y * r;
    out.z = center.z + out.z * r;
    return out;
  }
}
