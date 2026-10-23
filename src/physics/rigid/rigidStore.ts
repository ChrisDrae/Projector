import type { Quat } from "../../math/quat.js";
import type { Vec3 } from "../../math/vec3.js";
import { boundingRadius, inertia, shapeVolume, ShapeType, type Shape } from "./shapes.js";

/** Stable handle of a rigid body. */
export type RigidBodyId = number;

export const RigidFlags = {
  /** Takes part in collisions (same bit as BodyFlags.Collides, for the broadphase). */
  Collides: 1,
  /** Never moves. */
  Static: 2,
  /** Moves only by the velocity you give it; pushes others but nothing pushes it. */
  Kinematic: 4,
  /** At rest: skipped by the solver until something touches it. */
  Sleeping: 8,
} as const;

export interface RigidBodyOptions {
  shape: Shape;
  position: Vec3;
  /** Quaternion [x, y, z, w]. Default identity. */
  rotation?: ArrayLike<number>;
  velocity?: Vec3;
  /** Radians per second around each world axis. */
  angularVelocity?: Vec3;
  /** Default: density times volume, or 1 without a density. */
  mass?: number;
  density?: number;
  /** Default: the world's restitution. */
  restitution?: number;
  /** Default: the world's friction (or 0.5 when the world has none). */
  friction?: number;
  isStatic?: boolean;
  isKinematic?: boolean;
  collides?: boolean;
  /** Collision group 0-31, like particles. */
  group?: number;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Rigid bodies in flat typed arrays (structure of arrays), like BodyStore for particles: position,
 * orientation quaternion, linear and angular velocity, inverse mass and inertia, shape and material.
 * Dense indices change on removal (swap-remove); ids never do. Positions and orientations are f64 so
 * stacks stay steady.
 */
export class RigidBodyStore {
  count: number = 0;
  capacity: number;
  pos: Float64Array;
  /** x, y, z, w per body. */
  quat: Float64Array;
  vel: Float64Array;
  angVel: Float64Array;
  /** Accumulated force and torque, cleared after every step. */
  force: Float64Array;
  torque: Float64Array;
  mass: Float64Array;
  invMass: Float64Array;
  /** Inverse principal moments in the body frame. */
  invInertia: Float64Array;
  /** Inverse inertia tensor in world space (3x3, row-major), refreshed every step. */
  invInertiaWorld: Float64Array;
  shape: Uint8Array;
  /** Sphere: radius. Box: half extents. Capsule: radius, half height. */
  dims: Float64Array;
  /** Bounding sphere radius (what the broadphase sees). */
  radius: Float64Array;
  restitution: Float64Array;
  friction: Float64Array;
  /** Seconds the body has been nearly still (sleeping happens per island). */
  sleepTime: Float64Array;
  flags: Uint8Array;
  group: Uint8Array;
  ids: Int32Array;
  maxRadius: number = 0;
  private idToIndex: Int32Array = new Int32Array(0);
  private nextId: number = 0;

  constructor(initialCapacity: number = 64) {
    const cap = Math.max(1, Math.floor(initialCapacity));
    this.capacity = cap;
    this.pos = new Float64Array(cap * 3);
    this.quat = new Float64Array(cap * 4);
    this.vel = new Float64Array(cap * 3);
    this.angVel = new Float64Array(cap * 3);
    this.force = new Float64Array(cap * 3);
    this.torque = new Float64Array(cap * 3);
    this.mass = new Float64Array(cap);
    this.invMass = new Float64Array(cap);
    this.invInertia = new Float64Array(cap * 3);
    this.invInertiaWorld = new Float64Array(cap * 9);
    this.shape = new Uint8Array(cap);
    this.dims = new Float64Array(cap * 3);
    this.radius = new Float64Array(cap);
    this.restitution = new Float64Array(cap);
    this.friction = new Float64Array(cap);
    this.sleepTime = new Float64Array(cap);
    this.flags = new Uint8Array(cap);
    this.group = new Uint8Array(cap);
    this.ids = new Int32Array(cap);
  }

  add(o: RigidBodyOptions, defaultRestitution: number, defaultFriction: number): RigidBodyId {
    if (this.count === this.capacity) this.grow(this.capacity * 2);
    const i = this.count++;
    const id = this.nextId++;
    if (id >= this.idToIndex.length) {
      const map = new Int32Array(Math.max(64, this.idToIndex.length * 2)).fill(-1);
      map.set(this.idToIndex);
      this.idToIndex = map;
    }
    this.idToIndex[id] = i;
    this.ids[i] = id;

    const p = o.position;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    const q = o.rotation;
    const qx = q ? q[0] : 0;
    const qy = q ? q[1] : 0;
    const qz = q ? q[2] : 0;
    const qw = q ? q[3] : 1;
    const ql = Math.hypot(qx, qy, qz, qw) || 1;
    this.quat[i * 4] = qx / ql;
    this.quat[i * 4 + 1] = qy / ql;
    this.quat[i * 4 + 2] = qz / ql;
    this.quat[i * 4 + 3] = qw / ql;
    const v = o.velocity;
    const w = o.angularVelocity;
    this.vel[i * 3] = v ? v.x : 0;
    this.vel[i * 3 + 1] = v ? v.y : 0;
    this.vel[i * 3 + 2] = v ? v.z : 0;
    this.angVel[i * 3] = w ? w.x : 0;
    this.angVel[i * 3 + 1] = w ? w.y : 0;
    this.angVel[i * 3 + 2] = w ? w.z : 0;
    this.force.fill(0, i * 3, i * 3 + 3);
    this.torque.fill(0, i * 3, i * 3 + 3);

    const shape = o.shape;
    switch (shape.type) {
      case "sphere":
        this.shape[i] = ShapeType.Sphere;
        this.dims[i * 3] = shape.radius;
        this.dims[i * 3 + 1] = 0;
        this.dims[i * 3 + 2] = 0;
        break;
      case "box":
        this.shape[i] = ShapeType.Box;
        this.dims[i * 3] = shape.halfExtents.x;
        this.dims[i * 3 + 1] = shape.halfExtents.y;
        this.dims[i * 3 + 2] = shape.halfExtents.z;
        break;
      case "capsule":
        this.shape[i] = ShapeType.Capsule;
        this.dims[i * 3] = shape.radius;
        this.dims[i * 3 + 1] = shape.halfHeight;
        this.dims[i * 3 + 2] = 0;
        break;
    }
    this.radius[i] = boundingRadius(shape);

    let flags = o.collides === false ? 0 : RigidFlags.Collides;
    if (o.isStatic) flags |= RigidFlags.Static;
    else if (o.isKinematic) flags |= RigidFlags.Kinematic;
    this.flags[i] = flags;
    this.group[i] = o.group ?? 0;
    this.restitution[i] = o.restitution ?? defaultRestitution;
    this.friction[i] = o.friction ?? defaultFriction;
    this.sleepTime[i] = 0;

    const mass = o.mass ?? (o.density !== undefined ? o.density * shapeVolume(shape) : 1);
    this.setMassAt(i, mass, shape);
    if (flags & RigidFlags.Collides && this.radius[i] > this.maxRadius) this.maxRadius = this.radius[i];
    this.updateWorldInertia(i);
    return id;
  }

  remove(id: RigidBodyId): boolean {
    const i = this.indexOf(id);
    if (i < 0) return false;
    const last = --this.count;
    if (i !== last) {
      this.copy(last, i);
      this.idToIndex[this.ids[i]] = i;
    }
    this.idToIndex[id] = -1;
    this.recomputeMaxRadius();
    return true;
  }

  clear(): void {
    this.count = 0;
    this.maxRadius = 0;
    this.idToIndex.fill(-1);
  }

  indexOf(id: RigidBodyId): number {
    return id >= 0 && id < this.idToIndex.length ? this.idToIndex[id] : -1;
  }

  has(id: RigidBodyId): boolean {
    return this.indexOf(id) >= 0;
  }

  /** Whether the body is moved by the solver (not static, kinematic or asleep). */
  isDynamic(i: number): boolean {
    return (this.flags[i] & (RigidFlags.Static | RigidFlags.Kinematic)) === 0;
  }

  getPosition(id: RigidBodyId, out: Vec3): Vec3 {
    const i = this.require(id) * 3;
    out.x = this.pos[i];
    out.y = this.pos[i + 1];
    out.z = this.pos[i + 2];
    return out;
  }

  setPosition(id: RigidBodyId, p: Vec3): void {
    const i = this.require(id);
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.wakeAt(i);
  }

  getRotation(id: RigidBodyId, out: Quat): Quat {
    const i = this.require(id) * 4;
    out[0] = this.quat[i];
    out[1] = this.quat[i + 1];
    out[2] = this.quat[i + 2];
    out[3] = this.quat[i + 3];
    return out;
  }

  setRotation(id: RigidBodyId, q: ArrayLike<number>): void {
    const i = this.require(id);
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    for (let k = 0; k < 4; k++) this.quat[i * 4 + k] = q[k] / l;
    this.updateWorldInertia(i);
    this.wakeAt(i);
  }

  getVelocity(id: RigidBodyId, out: Vec3): Vec3 {
    const i = this.require(id) * 3;
    out.x = this.vel[i];
    out.y = this.vel[i + 1];
    out.z = this.vel[i + 2];
    return out;
  }

  setVelocity(id: RigidBodyId, v: Vec3): void {
    const i = this.require(id);
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.wakeAt(i);
  }

  getAngularVelocity(id: RigidBodyId, out: Vec3): Vec3 {
    const i = this.require(id) * 3;
    out.x = this.angVel[i];
    out.y = this.angVel[i + 1];
    out.z = this.angVel[i + 2];
    return out;
  }

  setAngularVelocity(id: RigidBodyId, w: Vec3): void {
    const i = this.require(id);
    this.angVel[i * 3] = w.x;
    this.angVel[i * 3 + 1] = w.y;
    this.angVel[i * 3 + 2] = w.z;
    this.wakeAt(i);
  }

  /** Instant change of momentum, at a world point (default the center, which doesn't spin the body). */
  applyImpulse(id: RigidBodyId, j: Vec3, point?: Vec3): void {
    const i = this.require(id);
    if (!this.isDynamic(i)) return;
    this.wakeAt(i);
    const w = this.invMass[i];
    this.vel[i * 3] += j.x * w;
    this.vel[i * 3 + 1] += j.y * w;
    this.vel[i * 3 + 2] += j.z * w;
    if (point) {
      const rx = point.x - this.pos[i * 3];
      const ry = point.y - this.pos[i * 3 + 1];
      const rz = point.z - this.pos[i * 3 + 2];
      scratch.x = ry * j.z - rz * j.y;
      scratch.y = rz * j.x - rx * j.z;
      scratch.z = rx * j.y - ry * j.x;
      this.addAngular(i, scratch.x, scratch.y, scratch.z);
    }
  }

  /** Force for the next fixed step, at a world point (default the center). */
  applyForce(id: RigidBodyId, f: Vec3, point?: Vec3): void {
    const i = this.require(id);
    this.force[i * 3] += f.x;
    this.force[i * 3 + 1] += f.y;
    this.force[i * 3 + 2] += f.z;
    if (point) {
      const rx = point.x - this.pos[i * 3];
      const ry = point.y - this.pos[i * 3 + 1];
      const rz = point.z - this.pos[i * 3 + 2];
      this.torque[i * 3] += ry * f.z - rz * f.y;
      this.torque[i * 3 + 1] += rz * f.x - rx * f.z;
      this.torque[i * 3 + 2] += rx * f.y - ry * f.x;
    }
    this.wakeAt(i);
  }

  applyTorque(id: RigidBodyId, t: Vec3): void {
    const i = this.require(id);
    this.torque[i * 3] += t.x;
    this.torque[i * 3 + 1] += t.y;
    this.torque[i * 3 + 2] += t.z;
    this.wakeAt(i);
  }

  wake(id: RigidBodyId): void {
    this.wakeAt(this.require(id));
  }

  isSleeping(id: RigidBodyId): boolean {
    return (this.flags[this.require(id)] & RigidFlags.Sleeping) !== 0;
  }

  wakeAt(i: number): void {
    this.flags[i] &= ~RigidFlags.Sleeping;
    this.sleepTime[i] = 0;
  }

  /** ω += I⁻¹ τ-impulse, with the world-space inverse inertia. */
  addAngular(i: number, x: number, y: number, z: number): void {
    const m = this.invInertiaWorld;
    const o = i * 9;
    this.angVel[i * 3] += m[o] * x + m[o + 1] * y + m[o + 2] * z;
    this.angVel[i * 3 + 1] += m[o + 3] * x + m[o + 4] * y + m[o + 5] * z;
    this.angVel[i * 3 + 2] += m[o + 6] * x + m[o + 7] * y + m[o + 8] * z;
  }

  /** R diag(I⁻¹) Rᵀ for the body's current orientation. */
  updateWorldInertia(i: number): void {
    const q = this.quat;
    const x = q[i * 4];
    const y = q[i * 4 + 1];
    const z = q[i * 4 + 2];
    const w = q[i * 4 + 3];
    // Rotation matrix, row-major
    const r00 = 1 - 2 * (y * y + z * z);
    const r01 = 2 * (x * y - z * w);
    const r02 = 2 * (x * z + y * w);
    const r10 = 2 * (x * y + z * w);
    const r11 = 1 - 2 * (x * x + z * z);
    const r12 = 2 * (y * z - x * w);
    const r20 = 2 * (x * z - y * w);
    const r21 = 2 * (y * z + x * w);
    const r22 = 1 - 2 * (x * x + y * y);
    const a = this.invInertia[i * 3];
    const b = this.invInertia[i * 3 + 1];
    const c = this.invInertia[i * 3 + 2];
    const m = this.invInertiaWorld;
    const o = i * 9;
    m[o] = r00 * r00 * a + r01 * r01 * b + r02 * r02 * c;
    m[o + 1] = r00 * r10 * a + r01 * r11 * b + r02 * r12 * c;
    m[o + 2] = r00 * r20 * a + r01 * r21 * b + r02 * r22 * c;
    m[o + 3] = m[o + 1];
    m[o + 4] = r10 * r10 * a + r11 * r11 * b + r12 * r12 * c;
    m[o + 5] = r10 * r20 * a + r11 * r21 * b + r12 * r22 * c;
    m[o + 6] = m[o + 2];
    m[o + 7] = m[o + 5];
    m[o + 8] = r20 * r20 * a + r21 * r21 * b + r22 * r22 * c;
  }

  recomputeMaxRadius(): void {
    let max = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.flags[i] & RigidFlags.Collides && this.radius[i] > max) max = this.radius[i];
    }
    this.maxRadius = max;
  }

  private setMassAt(i: number, mass: number, shape: Shape): void {
    const fixed = (this.flags[i] & (RigidFlags.Static | RigidFlags.Kinematic)) !== 0 || !(mass > 0);
    this.mass[i] = mass;
    this.invMass[i] = fixed ? 0 : 1 / mass;
    inertia(shape, mass, scratch);
    this.invInertia[i * 3] = fixed || !(scratch.x > 0) ? 0 : 1 / scratch.x;
    this.invInertia[i * 3 + 1] = fixed || !(scratch.y > 0) ? 0 : 1 / scratch.y;
    this.invInertia[i * 3 + 2] = fixed || !(scratch.z > 0) ? 0 : 1 / scratch.z;
  }

  private require(id: RigidBodyId): number {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`Rigid body ${id} does not exist.`);
    return i;
  }

  private copy(from: number, to: number): void {
    const move = (a: Float64Array | Uint8Array | Int32Array, k: number): void => {
      for (let c = 0; c < k; c++) a[to * k + c] = a[from * k + c];
    };
    move(this.pos, 3);
    move(this.quat, 4);
    move(this.vel, 3);
    move(this.angVel, 3);
    move(this.force, 3);
    move(this.torque, 3);
    move(this.mass, 1);
    move(this.invMass, 1);
    move(this.invInertia, 3);
    move(this.invInertiaWorld, 9);
    move(this.shape, 1);
    move(this.dims, 3);
    move(this.radius, 1);
    move(this.restitution, 1);
    move(this.friction, 1);
    move(this.sleepTime, 1);
    move(this.flags, 1);
    move(this.group, 1);
    move(this.ids, 1);
  }

  private grow(cap: number): void {
    const f = (a: Float64Array, k: number): Float64Array => {
      const b = new Float64Array(cap * k);
      b.set(a);
      return b;
    };
    this.pos = f(this.pos, 3);
    this.quat = f(this.quat, 4);
    this.vel = f(this.vel, 3);
    this.angVel = f(this.angVel, 3);
    this.force = f(this.force, 3);
    this.torque = f(this.torque, 3);
    this.mass = f(this.mass, 1);
    this.invMass = f(this.invMass, 1);
    this.invInertia = f(this.invInertia, 3);
    this.invInertiaWorld = f(this.invInertiaWorld, 9);
    this.dims = f(this.dims, 3);
    this.radius = f(this.radius, 1);
    this.restitution = f(this.restitution, 1);
    this.friction = f(this.friction, 1);
    this.sleepTime = f(this.sleepTime, 1);
    const u8 = (a: Uint8Array): Uint8Array => {
      const b = new Uint8Array(cap);
      b.set(a);
      return b;
    };
    this.shape = u8(this.shape);
    this.flags = u8(this.flags);
    this.group = u8(this.group);
    const ids = new Int32Array(cap);
    ids.set(this.ids);
    this.ids = ids;
    this.capacity = cap;
  }
}
