import * as quat from "../math/quat.js";
import { Transform } from "../math/transform.js";
import type { Vec3 } from "../math/vec3.js";
import type { BodyStore, FloatArray } from "./bodyStore.js";
import { BodyFlags, type Collider, type SolverSettings } from "./types.js";

/**
 * Pushes body i out along the unit normal n by `pen`, then bounces its velocity relative to a wall moving
 * with velocity (wx, wy, wz). Only bodies moving into the wall are bounced, so nothing sticks to walls.
 */
function contact(
  pos: FloatArray,
  vel: FloatArray,
  o: number,
  nx: number,
  ny: number,
  nz: number,
  pen: number,
  wx: number,
  wy: number,
  wz: number,
  e: number,
  mu: number,
  restThreshold: number,
): void {
  pos[o] += nx * pen;
  pos[o + 1] += ny * pen;
  pos[o + 2] += nz * pen;
  const rx = vel[o] - wx;
  const ry = vel[o + 1] - wy;
  const rz = vel[o + 2] - wz;
  const vn = rx * nx + ry * ny + rz * nz;
  if (vn >= 0) return;
  const jn = -(1 + (-vn > restThreshold ? e : 0)) * vn;
  vel[o] += nx * jn;
  vel[o + 1] += ny * jn;
  vel[o + 2] += nz * jn;
  if (mu > 0) {
    const tx = rx - vn * nx;
    const ty = ry - vn * ny;
    const tz = rz - vn * nz;
    const vt = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (vt > 1e-12) {
      const k = Math.min(vt, mu * jn) / vt;
      vel[o] -= tx * k;
      vel[o + 1] -= ty * k;
      vel[o + 2] -= tz * k;
    }
  }
}

export interface BoxContainerOptions {
  /** Edge length, or full size per axis. */
  size: number | Vec3;
  position?: Vec3;
  /** Share a transform with a MeshNode so the rendered box follows the physics one. */
  transform?: Transform;
  /** Defaults to the world setting. */
  restitution?: number;
  friction?: number;
  /** Caps the wall speed used in collisions, so violent spins don't launch bodies at absurd speeds. */
  maxTransferSpeed?: number;
}

/**
 * Keeps bodies INSIDE an oriented box. The box is kinematic: set `linearVelocity` and `angularVelocity`
 * and the world moves it each step, and the moving walls hand their velocity to the bodies they hit.
 * (Writing `transform.position` directly teleports the box: bodies get clamped back in, but not flung.)
 */
export class BoxContainer implements Collider {
  readonly transform: Transform;
  halfExtents: Vec3;
  linearVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  angularVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  restitution: number | null;
  friction: number | null;
  maxTransferSpeed: number;
  /** World-space unit axes, cached once per step. */
  readonly axisX: Vec3 = { x: 1, y: 0, z: 0 };
  readonly axisY: Vec3 = { x: 0, y: 1, z: 0 };
  readonly axisZ: Vec3 = { x: 0, y: 0, z: 1 };
  private readonly axes: Vec3[] = [this.axisX, this.axisY, this.axisZ];
  private readonly halves: Float64Array = new Float64Array(3);

  constructor(options: BoxContainerOptions) {
    const s = options.size;
    this.halfExtents = typeof s === "number" ? { x: s / 2, y: s / 2, z: s / 2 } : { x: s.x / 2, y: s.y / 2, z: s.z / 2 };
    this.transform = options.transform ?? new Transform(options.position ?? { x: 0, y: 0, z: 0 });
    if (options.transform && options.position) this.transform.position = options.position;
    this.restitution = options.restitution ?? null;
    this.friction = options.friction ?? null;
    this.maxTransferSpeed = options.maxTransferSpeed ?? Infinity;
    this.cacheAxes();
  }

  update(dt: number): void {
    const p = this.transform.position;
    const v = this.linearVelocity;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    quat.integrate(this.transform.rotation, this.transform.rotation, this.angularVelocity, dt);
    this.cacheAxes();
  }

  /** Re-reads the axes from the transform (update() does this; call it after rotating the transform by hand). */
  cacheAxes(): void {
    this.transform.axes(this.axisX, this.axisY, this.axisZ);
  }

  /** True if the point is inside the box. */
  containsPoint(p: Vec3, margin: number = 0): boolean {
    const c = this.transform.position;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    const h = this.halfExtents;
    const ax = this.axisX;
    const ay = this.axisY;
    const az = this.axisZ;
    return (
      Math.abs(dx * ax.x + dy * ax.y + dz * ax.z) <= h.x - margin &&
      Math.abs(dx * ay.x + dy * ay.y + dz * ay.z) <= h.y - margin &&
      Math.abs(dx * az.x + dy * az.y + dz * az.z) <= h.z - margin
    );
  }

  solve(s: BodyStore, set: SolverSettings): void {
    const e = this.restitution ?? set.restitution;
    const mu = this.friction ?? set.friction;
    const c = this.transform.position;
    const lv = this.linearVelocity;
    const w = this.angularVelocity;
    const axes = this.axes;
    const halves = this.halves;
    halves[0] = this.halfExtents.x;
    halves[1] = this.halfExtents.y;
    halves[2] = this.halfExtents.z;
    const maxSpeed = this.maxTransferSpeed;
    const pos = s.pos;
    const vel = s.vel;
    const radius = s.radius;
    const flags = s.flags;

    for (let i = 0; i < s.count; i++) {
      if (flags[i] & BodyFlags.Static) continue;
      const o = i * 3;
      const r = radius[i];
      for (let k = 0; k < 3; k++) {
        const a = axes[k];
        const lim = Math.max(halves[k] - r, 0);
        const l = (pos[o] - c.x) * a.x + (pos[o + 1] - c.y) * a.y + (pos[o + 2] - c.z) * a.z;
        let sign: number;
        let pen: number;
        if (l > lim) {
          sign = -1;
          pen = l - lim;
        } else if (l < -lim) {
          sign = 1;
          pen = -lim - l;
        } else {
          continue;
        }
        // Velocity of the wall at the contact point: v + w x (p - c)
        const px = pos[o] - c.x;
        const py = pos[o + 1] - c.y;
        const pz = pos[o + 2] - c.z;
        let wx = lv.x + (w.y * pz - w.z * py);
        let wy = lv.y + (w.z * px - w.x * pz);
        let wz = lv.z + (w.x * py - w.y * px);
        const speed = Math.sqrt(wx * wx + wy * wy + wz * wz);
        if (speed > maxSpeed) {
          const k2 = maxSpeed / speed;
          wx *= k2;
          wy *= k2;
          wz *= k2;
        }
        contact(pos, vel, o, a.x * sign, a.y * sign, a.z * sign, pen, wx, wy, wz, e, mu, set.restThreshold);
      }
    }
  }
}

export interface ColliderMaterial {
  restitution?: number;
  friction?: number;
}

/** Infinite plane dot(normal, p) = offset; bodies stay on the side the normal points to. */
export class PlaneCollider implements Collider {
  normal: Vec3;
  offset: number;
  restitution: number | null;
  friction: number | null;

  constructor(normal: Vec3 = { x: 0, y: 1, z: 0 }, offset: number = 0, options: ColliderMaterial = {}) {
    const len = Math.hypot(normal.x, normal.y, normal.z) || 1;
    this.normal = { x: normal.x / len, y: normal.y / len, z: normal.z / len };
    this.offset = offset;
    this.restitution = options.restitution ?? null;
    this.friction = options.friction ?? null;
  }

  static fromPointNormal(point: Vec3, normal: Vec3, options: ColliderMaterial = {}): PlaneCollider {
    const plane = new PlaneCollider(normal, 0, options);
    const n = plane.normal;
    plane.offset = n.x * point.x + n.y * point.y + n.z * point.z;
    return plane;
  }

  update(): void {}

  solve(s: BodyStore, set: SolverSettings): void {
    const e = this.restitution ?? set.restitution;
    const mu = this.friction ?? set.friction;
    const n = this.normal;
    const pos = s.pos;
    for (let i = 0; i < s.count; i++) {
      if (s.flags[i] & BodyFlags.Static) continue;
      const o = i * 3;
      const d = n.x * pos[o] + n.y * pos[o + 1] + n.z * pos[o + 2] - this.offset - s.radius[i];
      if (d < 0) contact(pos, s.vel, o, n.x, n.y, n.z, -d, 0, 0, 0, e, mu, set.restThreshold);
    }
  }
}

export interface SphereColliderOptions extends ColliderMaterial {
  /** Keep bodies inside the sphere instead of outside. Default false. */
  inside?: boolean;
}

/** Static sphere: an obstacle bodies bounce off, or (inside: true) a round container. */
export class SphereCollider implements Collider {
  center: Vec3;
  radius: number;
  inside: boolean;
  restitution: number | null;
  friction: number | null;

  constructor(center: Vec3, radius: number, options: SphereColliderOptions = {}) {
    this.center = center;
    this.radius = radius;
    this.inside = options.inside ?? false;
    this.restitution = options.restitution ?? null;
    this.friction = options.friction ?? null;
  }

  update(): void {}

  solve(s: BodyStore, set: SolverSettings): void {
    const e = this.restitution ?? set.restitution;
    const mu = this.friction ?? set.friction;
    const c = this.center;
    const pos = s.pos;
    for (let i = 0; i < s.count; i++) {
      if (s.flags[i] & BodyFlags.Static) continue;
      const o = i * 3;
      const dx = pos[o] - c.x;
      const dy = pos[o + 1] - c.y;
      const dz = pos[o + 2] - c.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r = s.radius[i];
      if (this.inside) {
        const limit = Math.max(this.radius - r, 0);
        if (d > limit && d > 0) {
          contact(pos, s.vel, o, -dx / d, -dy / d, -dz / d, d - limit, 0, 0, 0, e, mu, set.restThreshold);
        }
      } else {
        const limit = this.radius + r;
        if (d < limit) {
          if (d > 1e-12) contact(pos, s.vel, o, dx / d, dy / d, dz / d, limit - d, 0, 0, 0, e, mu, set.restThreshold);
          else contact(pos, s.vel, o, 0, 1, 0, limit, 0, 0, 0, e, mu, set.restThreshold);
        }
      }
    }
  }
}
