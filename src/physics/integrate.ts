import type { Vec3 } from "../math/vec3.js";
import type { BodyStore } from "./bodyStore.js";
import { BodyFlags } from "./types.js";

/** Semi-implicit Euler, part 1: v += (F / m + g) * dt, with optional linear damping. */
export function integrateVelocities(s: BodyStore, gravity: Vec3, dt: number, linearDamping: number): void {
  const n = s.count;
  const vel = s.vel;
  const force = s.force;
  const invMass = s.invMass;
  const flags = s.flags;
  const damp = linearDamping > 0 ? 1 / (1 + linearDamping * dt) : 1;
  const gx = gravity.x * dt;
  const gy = gravity.y * dt;
  const gz = gravity.z * dt;
  for (let i = 0; i < n; i++) {
    if (flags[i] & BodyFlags.Static) continue;
    const w = invMass[i] * dt;
    const o = i * 3;
    vel[o] = (vel[o] + force[o] * w + gx) * damp;
    vel[o + 1] = (vel[o + 1] + force[o + 1] * w + gy) * damp;
    vel[o + 2] = (vel[o + 2] + force[o + 2] * w + gz) * damp;
  }
}

/** Semi-implicit Euler, part 2: x += v * dt (with the already updated velocity). */
export function integratePositions(s: BodyStore, dt: number): void {
  const n = s.count;
  const pos = s.pos;
  const vel = s.vel;
  const flags = s.flags;
  for (let i = 0; i < n; i++) {
    if (flags[i] & BodyFlags.Static) continue;
    const o = i * 3;
    pos[o] += vel[o] * dt;
    pos[o + 1] += vel[o + 1] * dt;
    pos[o + 2] += vel[o + 2] * dt;
  }
}
