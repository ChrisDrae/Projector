import type { BodyStore } from "./bodyStore.js";
import type { ForceGenerator } from "./types.js";

/**
 * Newtonian gravity between every pair of bodies: F = G m_i m_j d / (|d|^2 + softening^2)^1.5.
 * Each pair is visited once and gets equal and opposite forces, so momentum is conserved. Brute force,
 * O(n^2 / 2): comfortable up to about a thousand bodies.
 */
export class NBodyGravity implements ForceGenerator {
  G: number;
  /** Smooths the force at short range so close encounters don't explode. */
  softening: number;

  constructor(G: number = 1, softening: number = 0.01) {
    this.G = G;
    this.softening = softening;
  }

  apply(s: BodyStore): void {
    const n = s.count;
    const pos = s.pos;
    const mass = s.mass;
    const force = s.force;
    const eps2 = this.softening * this.softening;
    const G = this.G;
    for (let i = 0; i < n; i++) {
      const oi = i * 3;
      const xi = pos[oi];
      const yi = pos[oi + 1];
      const zi = pos[oi + 2];
      const gmi = G * mass[i];
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (let j = i + 1; j < n; j++) {
        const oj = j * 3;
        const dx = pos[oj] - xi;
        const dy = pos[oj + 1] - yi;
        const dz = pos[oj + 2] - zi;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        const f = (gmi * mass[j]) / (r2 * Math.sqrt(r2));
        fx += dx * f;
        fy += dy * f;
        fz += dz * f;
        force[oj] -= dx * f;
        force[oj + 1] -= dy * f;
        force[oj + 2] -= dz * f;
      }
      force[oi] += fx;
      force[oi + 1] += fy;
      force[oi + 2] += fz;
    }
  }

  /** Total gravitational potential energy (with the same softening). */
  potentialEnergy(s: BodyStore): number {
    const n = s.count;
    const pos = s.pos;
    const eps2 = this.softening * this.softening;
    let e = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j * 3] - pos[i * 3];
        const dy = pos[j * 3 + 1] - pos[i * 3 + 1];
        const dz = pos[j * 3 + 2] - pos[i * 3 + 2];
        e -= (this.G * s.mass[i] * s.mass[j]) / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
      }
    }
    return e;
  }
}

/** Total kinetic energy of all bodies. */
export function kineticEnergy(s: BodyStore): number {
  let e = 0;
  for (let i = 0; i < s.count; i++) {
    const vx = s.vel[i * 3];
    const vy = s.vel[i * 3 + 1];
    const vz = s.vel[i * 3 + 2];
    e += 0.5 * s.mass[i] * (vx * vx + vy * vy + vz * vz);
  }
  return e;
}
