import type { BodyStore } from "./bodyStore.js";
import type { BodyId, Constraint, ForceGenerator } from "./types.js";

function growInt(a: Int32Array, n: number): Int32Array {
  if (n <= a.length) return a;
  const b = new Int32Array(Math.max(n, a.length * 2, 64));
  b.set(a);
  return b;
}

function growFloat(a: Float64Array, n: number): Float64Array {
  if (n <= a.length) return a;
  const b = new Float64Array(Math.max(n, a.length * 2, 64));
  b.set(a);
  return b;
}

function distance(s: BodyStore, ia: number, ib: number): number {
  const dx = s.pos[ib * 3] - s.pos[ia * 3];
  const dy = s.pos[ib * 3 + 1] - s.pos[ia * 3 + 1];
  const dz = s.pos[ib * 3 + 2] - s.pos[ia * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export interface SpringOptions {
  /** Rest length. Default: the current distance. */
  rest?: number;
  stiffness?: number;
  damping?: number;
}

/**
 * Damped springs between pairs of bodies (Hooke's law), stored as flat arrays. Springs are forces, so they
 * stretch and oscillate; for stiff, inextensible links use DistanceConstraintSet. Bodies are referenced by
 * id, so springs survive other bodies being removed; springs whose bodies are gone are skipped.
 */
export class SpringSet implements ForceGenerator {
  count: number = 0;
  a: Int32Array = new Int32Array(0);
  b: Int32Array = new Int32Array(0);
  rest: Float64Array = new Float64Array(0);
  stiffness: Float64Array = new Float64Array(0);
  damping: Float64Array = new Float64Array(0);
  private readonly store: BodyStore;

  constructor(store: BodyStore) {
    this.store = store;
  }

  add(a: BodyId, b: BodyId, options: SpringOptions = {}): number {
    const n = this.count + 1;
    this.a = growInt(this.a, n);
    this.b = growInt(this.b, n);
    this.rest = growFloat(this.rest, n);
    this.stiffness = growFloat(this.stiffness, n);
    this.damping = growFloat(this.damping, n);
    const k = this.count++;
    this.a[k] = a;
    this.b[k] = b;
    this.rest[k] = options.rest ?? distance(this.store, this.store.indexOf(a), this.store.indexOf(b));
    this.stiffness[k] = options.stiffness ?? 100;
    this.damping[k] = options.damping ?? 0.5;
    return k;
  }

  apply(s: BodyStore): void {
    const pos = s.pos;
    const vel = s.vel;
    const force = s.force;
    for (let k = 0; k < this.count; k++) {
      const ia = s.indexOf(this.a[k]);
      const ib = s.indexOf(this.b[k]);
      if (ia < 0 || ib < 0) continue;
      const oa = ia * 3;
      const ob = ib * 3;
      const dx = pos[ob] - pos[oa];
      const dy = pos[ob + 1] - pos[oa + 1];
      const dz = pos[ob + 2] - pos[oa + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-12) continue;
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;
      const vn = (vel[ob] - vel[oa]) * nx + (vel[ob + 1] - vel[oa + 1]) * ny + (vel[ob + 2] - vel[oa + 2]) * nz;
      const f = this.stiffness[k] * (len - this.rest[k]) + this.damping[k] * vn;
      force[oa] += nx * f;
      force[oa + 1] += ny * f;
      force[oa + 2] += nz * f;
      force[ob] -= nx * f;
      force[ob + 1] -= ny * f;
      force[ob + 2] -= nz * f;
    }
  }
}

export interface DistanceConstraintOptions {
  /** Fraction of the length error corrected per solver iteration (0..1). Default 1. */
  stiffness?: number;
}

/**
 * Keeps pairs of bodies at a fixed distance (rods, chains, cloth), solved inside the world's iterations:
 * the length error is projected out, weighted by inverse mass, and the relative velocity along the link is
 * removed so the correction doesn't turn into jitter. Static bodies act as pins.
 */
export class DistanceConstraintSet implements Constraint {
  count: number = 0;
  a: Int32Array = new Int32Array(0);
  b: Int32Array = new Int32Array(0);
  rest: Float64Array = new Float64Array(0);
  stiffness: number;
  private readonly store: BodyStore;

  constructor(store: BodyStore, options: DistanceConstraintOptions = {}) {
    this.store = store;
    this.stiffness = options.stiffness ?? 1;
  }

  /** Links two bodies; the rest length defaults to their current distance. */
  add(a: BodyId, b: BodyId, rest?: number): number {
    const n = this.count + 1;
    this.a = growInt(this.a, n);
    this.b = growInt(this.b, n);
    this.rest = growFloat(this.rest, n);
    const k = this.count++;
    this.a[k] = a;
    this.b[k] = b;
    this.rest[k] = rest ?? distance(this.store, this.store.indexOf(a), this.store.indexOf(b));
    return k;
  }

  clear(): void {
    this.count = 0;
  }

  solve(s: BodyStore): void {
    const pos = s.pos;
    const vel = s.vel;
    const invMass = s.invMass;
    const stiffness = this.stiffness;
    for (let k = 0; k < this.count; k++) {
      const ia = s.indexOf(this.a[k]);
      const ib = s.indexOf(this.b[k]);
      if (ia < 0 || ib < 0) continue;
      const wa = invMass[ia];
      const wb = invMass[ib];
      const w = wa + wb;
      if (w === 0) continue;
      const oa = ia * 3;
      const ob = ib * 3;
      const dx = pos[ob] - pos[oa];
      const dy = pos[ob + 1] - pos[oa + 1];
      const dz = pos[ob + 2] - pos[oa + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-12) continue;
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      const c = (stiffness * (len - this.rest[k])) / w;
      pos[oa] += nx * c * wa;
      pos[oa + 1] += ny * c * wa;
      pos[oa + 2] += nz * c * wa;
      pos[ob] -= nx * c * wb;
      pos[ob + 1] -= ny * c * wb;
      pos[ob + 2] -= nz * c * wb;

      const vn = (vel[ob] - vel[oa]) * nx + (vel[ob + 1] - vel[oa + 1]) * ny + (vel[ob + 2] - vel[oa + 2]) * nz;
      const j = -vn / w;
      vel[oa] -= nx * j * wa;
      vel[oa + 1] -= ny * j * wa;
      vel[oa + 2] -= nz * j * wa;
      vel[ob] += nx * j * wb;
      vel[ob + 1] += ny * j * wb;
      vel[ob + 2] += nz * j * wb;
    }
  }
}
