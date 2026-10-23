import type { Vec3 } from "../math/vec3.js";
import type { BodyStore } from "./bodyStore.js";
import { BodyFlags, type ForceGenerator } from "./types.js";

/** Air resistance: F = -(linear + quadratic * |v|) * v. */
export class Drag implements ForceGenerator {
  linear: number;
  quadratic: number;

  constructor(linear: number = 0.1, quadratic: number = 0) {
    this.linear = linear;
    this.quadratic = quadratic;
  }

  apply(s: BodyStore): void {
    const vel = s.vel;
    const force = s.force;
    for (let i = 0; i < s.count; i++) {
      if (s.flags[i] & BodyFlags.Static) continue;
      const o = i * 3;
      const vx = vel[o];
      const vy = vel[o + 1];
      const vz = vel[o + 2];
      const k = this.linear + (this.quadratic > 0 ? this.quadratic * Math.sqrt(vx * vx + vy * vy + vz * vz) : 0);
      force[o] -= k * vx;
      force[o + 1] -= k * vy;
      force[o + 2] -= k * vz;
    }
  }
}

/**
 * Pulls every body toward a point with inverse-square falloff, like a fixed heavy mass:
 * acceleration = strength * d / (|d|^2 + softening^2)^1.5. Negative strength repels.
 */
export class Attractor implements ForceGenerator {
  position: Vec3;
  strength: number;
  softening: number;

  constructor(position: Vec3, strength: number = 1, softening: number = 0.05) {
    this.position = position;
    this.strength = strength;
    this.softening = softening;
  }

  apply(s: BodyStore): void {
    const pos = s.pos;
    const force = s.force;
    const c = this.position;
    const eps2 = this.softening * this.softening;
    for (let i = 0; i < s.count; i++) {
      if (s.flags[i] & BodyFlags.Static) continue;
      const o = i * 3;
      const dx = c.x - pos[o];
      const dy = c.y - pos[o + 1];
      const dz = c.z - pos[o + 2];
      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      const f = (this.strength * s.mass[i]) / (r2 * Math.sqrt(r2));
      force[o] += dx * f;
      force[o + 1] += dy * f;
      force[o + 2] += dz * f;
    }
  }
}

/** Samples a vector at a point and time into `out`. */
export type FieldFunction = (x: number, y: number, z: number, time: number, out: Vec3) => void;

export interface VectorFieldOptions {
  strength?: number;
  /** "acceleration" moves light and heavy bodies alike (like gravity); "force" is divided by mass. Default "force". */
  mode?: "force" | "acceleration";
}

/** A spatial field applied at every body: wind, currents, flow fields. */
export class VectorField implements ForceGenerator {
  field: FieldFunction;
  strength: number;
  mode: "force" | "acceleration";
  private readonly sample: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(field: FieldFunction, options: VectorFieldOptions = {}) {
    this.field = field;
    this.strength = options.strength ?? 1;
    this.mode = options.mode ?? "force";
  }

  apply(s: BodyStore, _dt: number, time: number): void {
    const pos = s.pos;
    const force = s.force;
    const v = this.sample;
    const byMass = this.mode === "acceleration";
    for (let i = 0; i < s.count; i++) {
      if (s.flags[i] & BodyFlags.Static) continue;
      const o = i * 3;
      v.x = 0;
      v.y = 0;
      v.z = 0;
      this.field(pos[o], pos[o + 1], pos[o + 2], time, v);
      const k = byMass ? this.strength * s.mass[i] : this.strength;
      force[o] += v.x * k;
      force[o + 1] += v.y * k;
      force[o + 2] += v.z * k;
    }
  }
}
