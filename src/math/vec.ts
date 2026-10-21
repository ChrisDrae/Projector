import type { Vec3 } from "./vec3.js";

/**
 * Convenience vector class. Every operation allocates a new Vec, which is fine for setup code;
 * use the `vec3` functions with scratch vectors in per-frame code.
 */
export class Vec implements Vec3 {
  x: number;
  y: number;
  z: number;

  static create(v: Vec3): Vec {
    return new Vec(v);
  }

  static addVectors(v: Vec3, v2: Vec3): Vec {
    return new Vec({ x: v.x + v2.x, y: v.y + v2.y, z: v.z + v2.z });
  }

  static subtractVectors(v: Vec3, v2: Vec3): Vec {
    return new Vec({ x: v.x - v2.x, y: v.y - v2.y, z: v.z - v2.z });
  }

  static distanceTo(d: Vec3, v: Vec3): number {
    const dx = v.x - d.x;
    const dy = v.y - d.y;
    const dz = v.z - d.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  static dot(v: Vec3, b: Vec3): number {
    return v.x * b.x + v.y * b.y + v.z * b.z;
  }

  static cross(a: Vec3, b: Vec3): Vec {
    return new Vec({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    });
  }

  static divideVector(v: Vec3, d: number): Vec {
    return new Vec({ x: v.x / d, y: v.y / d, z: v.z / d });
  }

  static scaleVector(v: Vec3, s: number): Vec {
    return new Vec({ x: v.x * s, y: v.y * s, z: v.z * s });
  }

  static getMagnitude(v: Vec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /** Unit vector; a zero vector returns (0, 0, 0) instead of NaN. */
  static getNormalvector(v: Vec3): Vec {
    const mag = Vec.getMagnitude(v);
    if (mag === 0) return new Vec({ x: 0, y: 0, z: 0 });
    return new Vec({ x: v.x / mag, y: v.y / mag, z: v.z / mag });
  }

  constructor(v: Vec3 = { x: 0, y: 0, z: 0 }) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
  }

  scaleSelf(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  add(v: Vec3): Vec {
    return new Vec({ x: this.x + v.x, y: this.y + v.y, z: this.z + v.z });
  }

  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  distanceTo(v: Vec3): number {
    return Vec.distanceTo(this, v);
  }
}
