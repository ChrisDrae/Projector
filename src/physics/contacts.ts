import type { BodyStore } from "./bodyStore.js";
import type { SolverSettings } from "./types.js";

const normal = new Float64Array(3);

/**
 * Deterministic pseudo-random unit vector for two bodies sitting exactly on top of each other, where the
 * contact normal is undefined. Previously this produced NaN, which wiped bodies out of the simulation.
 */
function fallbackNormal(a: number, b: number, out: Float64Array): void {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  const u = (h >>> 0) / 4294967296;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  const v = (h >>> 0) / 4294967296;
  const z = u * 2 - 1;
  const r = Math.sqrt(1 - z * z);
  out[0] = r * Math.cos(2 * Math.PI * v);
  out[1] = r * Math.sin(2 * Math.PI * v);
  out[2] = z;
}

/**
 * One Gauss-Seidel pass over sphere-sphere contacts. For each overlapping pair (i, j):
 * - separates them along the normal, weighted by inverse mass (the center of mass does not move)
 * - if they approach, applies an equal and opposite impulse with restitution (momentum is conserved)
 * - optionally applies Coulomb friction on the tangential relative velocity
 */
export function solveContacts(s: BodyStore, pairs: Int32Array, pairCount: number, set: SolverSettings): void {
  const pos = s.pos;
  const vel = s.vel;
  const radius = s.radius;
  const invMass = s.invMass;
  const ids = s.ids;
  const correction = set.positionCorrection;
  const mu = set.friction;

  for (let p = 0; p < pairCount; p++) {
    const i = pairs[p * 2];
    const j = pairs[p * 2 + 1];
    const oi = i * 3;
    const oj = j * 3;
    const dx = pos[oj] - pos[oi];
    const dy = pos[oj + 1] - pos[oi + 1];
    const dz = pos[oj + 2] - pos[oi + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    const rs = radius[i] + radius[j];
    if (d2 >= rs * rs) continue;
    const wi = invMass[i];
    const wj = invMass[j];
    const w = wi + wj;
    if (w === 0) continue;

    let d = Math.sqrt(d2);
    if (d > 1e-12) {
      normal[0] = dx / d;
      normal[1] = dy / d;
      normal[2] = dz / d;
    } else {
      fallbackNormal(ids[i], ids[j], normal);
      d = 0;
    }
    const nx = normal[0];
    const ny = normal[1];
    const nz = normal[2];

    // Positional correction
    const pen = rs - d;
    const c = (Math.max(pen - set.slop * rs, 0) * correction) / w;
    if (c > 0) {
      pos[oi] -= nx * c * wi;
      pos[oi + 1] -= ny * c * wi;
      pos[oi + 2] -= nz * c * wi;
      pos[oj] += nx * c * wj;
      pos[oj + 1] += ny * c * wj;
      pos[oj + 2] += nz * c * wj;
    }

    // Velocity impulse
    const rvx = vel[oj] - vel[oi];
    const rvy = vel[oj + 1] - vel[oi + 1];
    const rvz = vel[oj + 2] - vel[oi + 2];
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn >= 0) continue;
    const e = -vn > set.restThreshold ? set.restitution : 0;
    const jn = (-(1 + e) * vn) / w;
    vel[oi] -= nx * jn * wi;
    vel[oi + 1] -= ny * jn * wi;
    vel[oi + 2] -= nz * jn * wi;
    vel[oj] += nx * jn * wj;
    vel[oj + 1] += ny * jn * wj;
    vel[oj + 2] += nz * jn * wj;

    if (mu > 0) {
      const tx = rvx - vn * nx;
      const ty = rvy - vn * ny;
      const tz = rvz - vn * nz;
      const vt = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (vt > 1e-12) {
        const jt = Math.min(vt / w, mu * jn) / vt;
        vel[oi] += tx * jt * wi;
        vel[oi + 1] += ty * jt * wi;
        vel[oi + 2] += tz * jt * wi;
        vel[oj] -= tx * jt * wj;
        vel[oj + 1] -= ty * jt * wj;
        vel[oj + 2] -= tz * jt * wj;
      }
    }
  }
}
