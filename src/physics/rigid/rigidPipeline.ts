import type { Vec3 } from "../../math/vec3.js";
import type { BodyStore } from "../bodyStore.js";
import { HashGrid } from "../broadphase.js";
import { BoxContainer, PlaneCollider, SphereCollider } from "../colliders.js";
import type { Collider, StaticShapeSink } from "../types.js";
import {
  Manifold,
  boxBox,
  boxCorners,
  capsuleBox,
  capsuleCapsule,
  capsuleSphere,
  pointsPlane,
  sphereBox,
  sphereSphere,
} from "./narrowphase.js";
import { RigidFlags, type RigidBodyStore } from "./rigidStore.js";
import { ShapeType } from "./shapes.js";

export interface RigidSettings {
  /** Contacts are made this far before shapes touch (speculative), so fast bodies don't tunnel. */
  margin: number;
  /** Fraction of the remaining overlap corrected per second step (Baumgarte), and the overlap tolerated. */
  baumgarte: number;
  slop: number;
  /** Bodies under these speeds for sleepTime seconds (as a whole touching group) fall asleep. */
  sleep: boolean;
  sleepTime: number;
  sleepLinear: number;
  sleepAngular: number;
  maxAngularSpeed: number;
  linearDamping: number;
  angularDamping: number;
}

export function defaultRigidSettings(): RigidSettings {
  return {
    margin: 0.02,
    baumgarte: 0.2,
    slop: 0.005,
    sleep: true,
    sleepTime: 0.5,
    sleepLinear: 0.05,
    sleepAngular: 0.08,
    maxAngularSpeed: 60,
    linearDamping: 0.02,
    angularDamping: 0.05,
  };
}

export interface RigidStats {
  /** Contact points solved in the last step. */
  contacts: number;
  /** Candidate rigid-rigid pairs from the broadphase. */
  pairs: number;
  sleeping: number;
}

/** The parts of World the rigid pipeline works with. */
export interface RigidWorld {
  readonly rigid: RigidBodyStore;
  readonly bodies: BodyStore;
  readonly broadphase: HashGrid;
  readonly colliders: readonly Collider[];
  gravity: Vec3;
  restitution: number;
  friction: number;
}

const RIGID = 0;
const FIXED = 1;
const PARTICLE = 2;

/** Rotation of the axis-aligned boxes custom colliders report. */
const IDENTITY = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);

// Per contact: ints [a, kind, b, keyA, keyB] and floats at these offsets
const NI = 5;
const N = 0; // normal (3), A to B
const P = 3; // point (3)
const SEP = 6;
const WV = 7; // velocity of a fixed surface at the point (3)
const MU = 10;
const E = 11;
const RA = 12; // point relative to A's center (3)
const RB = 15; // relative to B's center (3)
const T1 = 18; // tangents (3 + 3)
const T2 = 21;
const MN = 24; // effective masses
const MT1 = 25;
const MT2 = 26;
const TARGET = 27; // normal velocity the solver aims for
const LN = 28; // accumulated impulses
const LT1 = 29;
const LT2 = 30;
const LOCAL = 31; // point in A's body frame (3), for matching across steps
const NF = 34;

class ContactBuffer {
  count: number = 0;
  ints: Int32Array = new Int32Array(64 * NI);
  floats: Float64Array = new Float64Array(64 * NF);

  push(a: number, kind: number, b: number, keyA: number, keyB: number): number {
    if (this.count * NI >= this.ints.length) {
      const ints = new Int32Array(this.ints.length * 2);
      ints.set(this.ints);
      this.ints = ints;
      const floats = new Float64Array(this.floats.length * 2);
      floats.set(this.floats);
      this.floats = floats;
    }
    const k = this.count++;
    const o = k * NI;
    this.ints[o] = a;
    this.ints[o + 1] = kind;
    this.ints[o + 2] = b;
    this.ints[o + 3] = keyA;
    this.ints[o + 4] = keyB;
    this.floats.fill(0, k * NF, k * NF + NF);
    return k;
  }
}

/** Hash of a contact pair key, for matching contacts across steps. */
function pairHash(keyA: number, kind: number, keyB: number, mask: number): number {
  return (Math.imul(keyA, 73856093) ^ Math.imul(keyB, 19349663) ^ Math.imul(kind + 1, 83492791)) & mask;
}

/**
 * Rigid body dynamics, run by World inside its fixed step: integrate forces, find contacts (rigid-rigid
 * through its own broadphase over bounding spheres, against the world's colliders, and against particles
 * through the particle grid), then sequential impulses with warm starting inside the world's solver
 * iterations, then integrate positions and put still groups to sleep.
 *
 * Contacts carry their accumulated impulses to the next step: a contact of the same pair near the same
 * point on body A starts from last step's impulses (warm starting), which is what lets stacks rest.
 */
export class RigidPipeline {
  readonly settings: RigidSettings = defaultRigidSettings();
  readonly stats: RigidStats = { contacts: 0, pairs: 0, sleeping: 0 };
  readonly broadphase: HashGrid = new HashGrid({ maxPairsPerBody: 64 });
  private contacts: ContactBuffer = new ContactBuffer();
  private previous: ContactBuffer = new ContactBuffer();
  private readonly manifold: Manifold = new Manifold();
  /** Rotation matrix per body (row-major), refreshed by detect(). */
  private rot: Float64Array = new Float64Array(0);
  private readonly capsule: Float64Array = new Float64Array(6);
  private readonly capsuleB: Float64Array = new Float64Array(6);
  private readonly corners: Float64Array = new Float64Array(24);
  /** Relative velocity (B minus A) at the contact last computed by relativeVelocity(). */
  private readonly rv: Float64Array = new Float64Array(3);
  private table: Int32Array = new Int32Array(0);
  private tableKeys: Int32Array = new Int32Array(0);
  private tableCount: Int32Array = new Int32Array(0);
  private parent: Int32Array = new Int32Array(0);
  private restless: Uint8Array = new Uint8Array(0);
  private islandTime: Float64Array = new Float64Array(0);
  /** The body (and its world, key and surface) a custom collider is reporting shapes for. */
  private sinkWorld: RigidWorld | null = null;
  private sinkBody: number = -1;
  private sinkKey: number = 0;
  private sinkFriction: number = 0;
  private sinkRestitution: number = 0;
  private readonly boxCenter: Float64Array = new Float64Array(3);
  private readonly boxHalf: Float64Array = new Float64Array(3);
  /** Where custom colliders report their shapes (Collider.rigidShapes). */
  private readonly sink: StaticShapeSink = {
    plane: (nx, ny, nz, offset) => {
      const w = this.sinkWorld;
      if (w && this.shapePlane(w.rigid, this.sinkBody, nx, ny, nz, offset)) this.pushSinkContacts(w);
    },
    box: (cx, cy, cz, hx, hy, hz) => {
      const w = this.sinkWorld;
      if (w && this.collideStaticBox(w.rigid, this.sinkBody, cx, cy, cz, hx, hy, hz)) this.pushSinkContacts(w);
    },
    sphere: (cx, cy, cz, radius) => {
      const w = this.sinkWorld;
      if (w && this.collideSphere(w.rigid, this.sinkBody, cx, cy, cz, radius)) this.pushSinkContacts(w);
    },
  };

  integrateVelocities(w: RigidWorld, dt: number): void {
    const s = w.rigid;
    const st = this.settings;
    const g = w.gravity;
    const lin = 1 / (1 + st.linearDamping * dt);
    const ang = 1 / (1 + st.angularDamping * dt);
    for (let i = 0; i < s.count; i++) {
      const f = s.flags[i];
      if (f & (RigidFlags.Static | RigidFlags.Kinematic | RigidFlags.Sleeping)) continue;
      const o = i * 3;
      const im = s.invMass[i] * dt;
      s.vel[o] = (s.vel[o] + g.x * dt + s.force[o] * im) * lin;
      s.vel[o + 1] = (s.vel[o + 1] + g.y * dt + s.force[o + 1] * im) * lin;
      s.vel[o + 2] = (s.vel[o + 2] + g.z * dt + s.force[o + 2] * im) * lin;
      s.addAngular(i, s.torque[o] * dt, s.torque[o + 1] * dt, s.torque[o + 2] * dt);
      s.angVel[o] *= ang;
      s.angVel[o + 1] *= ang;
      s.angVel[o + 2] *= ang;
      const wl = Math.hypot(s.angVel[o], s.angVel[o + 1], s.angVel[o + 2]);
      if (wl > st.maxAngularSpeed) {
        const k = st.maxAngularSpeed / wl;
        s.angVel[o] *= k;
        s.angVel[o + 1] *= k;
        s.angVel[o + 2] *= k;
      }
    }
  }

  /** Finds this step's contacts (positions as they are now) and prepares them for solving. */
  detect(w: RigidWorld, dt: number, collisionMask: Uint32Array | null): void {
    const s = w.rigid;
    const n = s.count;
    if (this.rot.length < n * 9) {
      this.rot = new Float64Array(s.capacity * 9);
      this.parent = new Int32Array(s.capacity);
      this.restless = new Uint8Array(s.capacity);
      this.islandTime = new Float64Array(s.capacity);
    }
    for (let i = 0; i < n; i++) this.rotation(s, i);
    this.indexPrevious();
    const buf = this.contacts;
    buf.count = 0;
    this.restless.fill(0, 0, n);

    // Rigid against rigid
    let pairs = 0;
    if (n >= 2) {
      const bp = this.broadphase;
      bp.collisionMask = collisionMask;
      bp.build(s);
      bp.findPairs(s);
      pairs = bp.pairCount;
      for (let p = 0; p < bp.pairCount; p++) {
        const i = bp.pairs[p * 2];
        const j = bp.pairs[p * 2 + 1];
        const fi = s.flags[i];
        const fj = s.flags[j];
        const activeI = (fi & (RigidFlags.Static | RigidFlags.Sleeping)) === 0;
        const activeJ = (fj & (RigidFlags.Static | RigidFlags.Sleeping)) === 0;
        if (!activeI && !activeJ) continue;
        if ((fi & RigidFlags.Kinematic && !s.isDynamic(j)) || (fj & RigidFlags.Kinematic && !s.isDynamic(i))) continue;
        if (!this.collideRigid(s, i, j)) continue;
        // Something awake touching a sleeper wakes it
        if (fi & RigidFlags.Sleeping) s.wakeAt(i);
        if (fj & RigidFlags.Sleeping) s.wakeAt(j);
        this.pushManifold(w, i, RIGID, j, s.ids[i], s.ids[j], s.friction[j], s.restitution[j]);
      }
    }
    this.stats.pairs = pairs;

    // Rigid against the world's colliders
    for (let i = 0; i < n; i++) {
      if (!s.isDynamic(i) || s.flags[i] & RigidFlags.Sleeping || !(s.flags[i] & RigidFlags.Collides)) continue;
      for (let c = 0; c < w.colliders.length; c++) this.collideCollider(w, i, w.colliders[c], c);
    }

    // Rigid against particles, through the particle grid
    const bodies = w.bodies;
    if (bodies.count > 0 && bodies.maxRadius > 0) {
      const grid = w.broadphase;
      const margin = this.settings.margin;
      for (let i = 0; i < n; i++) {
        if (!(s.flags[i] & RigidFlags.Collides)) continue;
        const o = i * 3;
        const found = grid.query(bodies, s.pos[o], s.pos[o + 1], s.pos[o + 2], s.radius[i] + bodies.maxRadius + margin);
        const list = grid.queryResult;
        for (let k = 0; k < found; k++) {
          const b = list[k];
          if (collisionMask !== null && ((collisionMask[s.group[i]] >>> bodies.group[b]) & 1) === 0) continue;
          const r = bodies.radius[b];
          if (!(r > 0)) continue;
          if (!this.collideSphere(s, i, bodies.pos[b * 3], bodies.pos[b * 3 + 1], bodies.pos[b * 3 + 2], r)) continue;
          if (s.flags[i] & RigidFlags.Sleeping) {
            // A resting pile of particles shouldn't keep bodies awake; a moving one wakes them
            const v2 = bodies.vel[b * 3] ** 2 + bodies.vel[b * 3 + 1] ** 2 + bodies.vel[b * 3 + 2] ** 2;
            if (v2 < this.settings.sleepLinear ** 2) continue;
            s.wakeAt(i);
          }
          this.pushManifold(w, i, PARTICLE, b, s.ids[i], bodies.ids[b], w.friction, w.restitution);
        }
      }
    }
    this.stats.contacts = buf.count;
    this.prepare(w, dt);
  }

  /** One sequential impulse pass over every contact (called once per world solver iteration). */
  solve(w: RigidWorld): void {
    const buf = this.contacts;
    const ints = buf.ints;
    const f = buf.floats;
    const rv = this.rv;
    for (let k = 0; k < buf.count; k++) {
      const a = ints[k * NI];
      const kind = ints[k * NI + 1];
      const b = ints[k * NI + 2];
      const o = k * NF;

      // Friction first, bounded by the normal impulse of the last pass
      const limit = f[o + MU] * f[o + LN];
      for (let t = 0; t < 2; t++) {
        const to = o + (t === 0 ? T1 : T2);
        const lo = o + (t === 0 ? LT1 : LT2);
        this.relativeVelocity(w, a, kind, b, o);
        const vt = rv[0] * f[to] + rv[1] * f[to + 1] + rv[2] * f[to + 2];
        const old = f[lo];
        let next = old - vt * f[o + (t === 0 ? MT1 : MT2)];
        if (next > limit) next = limit;
        else if (next < -limit) next = -limit;
        const dl = next - old;
        f[lo] = next;
        if (dl !== 0) this.applyImpulse(w, a, kind, b, o, f[to] * dl, f[to + 1] * dl, f[to + 2] * dl);
      }

      this.relativeVelocity(w, a, kind, b, o);
      const nx = f[o + N];
      const ny = f[o + N + 1];
      const nz = f[o + N + 2];
      const vn = rv[0] * nx + rv[1] * ny + rv[2] * nz;
      const old = f[o + LN];
      let next = old + (f[o + TARGET] - vn) * f[o + MN];
      if (next < 0) next = 0;
      const dl = next - old;
      f[o + LN] = next;
      if (dl !== 0) this.applyImpulse(w, a, kind, b, o, nx * dl, ny * dl, nz * dl);
    }
  }

  /** Velocity of B minus velocity of A at contact o, into rv. */
  private relativeVelocity(w: RigidWorld, a: number, kind: number, b: number, o: number): void {
    const s = w.rigid;
    const f = this.contacts.floats;
    const rv = this.rv;
    const rax = f[o + RA];
    const ray = f[o + RA + 1];
    const raz = f[o + RA + 2];
    const ao = a * 3;
    const wx = s.angVel[ao];
    const wy = s.angVel[ao + 1];
    const wz = s.angVel[ao + 2];
    let vx = -(s.vel[ao] + wy * raz - wz * ray);
    let vy = -(s.vel[ao + 1] + wz * rax - wx * raz);
    let vz = -(s.vel[ao + 2] + wx * ray - wy * rax);
    if (kind === RIGID) {
      const rbx = f[o + RB];
      const rby = f[o + RB + 1];
      const rbz = f[o + RB + 2];
      const bo = b * 3;
      const ux = s.angVel[bo];
      const uy = s.angVel[bo + 1];
      const uz = s.angVel[bo + 2];
      vx += s.vel[bo] + uy * rbz - uz * rby;
      vy += s.vel[bo + 1] + uz * rbx - ux * rbz;
      vz += s.vel[bo + 2] + ux * rby - uy * rbx;
    } else if (kind === PARTICLE) {
      const v = w.bodies.vel;
      vx += v[b * 3];
      vy += v[b * 3 + 1];
      vz += v[b * 3 + 2];
    } else {
      vx += f[o + WV];
      vy += f[o + WV + 1];
      vz += f[o + WV + 2];
    }
    rv[0] = vx;
    rv[1] = vy;
    rv[2] = vz;
  }

  /** Moves the bodies by their solved velocities, then handles sleeping and keeps the impulses. */
  integratePositions(w: RigidWorld, dt: number): void {
    const s = w.rigid;
    for (let i = 0; i < s.count; i++) {
      const fl = s.flags[i];
      if (fl & (RigidFlags.Static | RigidFlags.Sleeping)) continue;
      const o = i * 3;
      s.pos[o] += s.vel[o] * dt;
      s.pos[o + 1] += s.vel[o + 1] * dt;
      s.pos[o + 2] += s.vel[o + 2] * dt;
      // q += dt / 2 * (ω, 0) q
      const wx = s.angVel[o];
      const wy = s.angVel[o + 1];
      const wz = s.angVel[o + 2];
      if (wx === 0 && wy === 0 && wz === 0) continue;
      const q = s.quat;
      const qo = i * 4;
      const x = q[qo];
      const y = q[qo + 1];
      const z = q[qo + 2];
      const qw = q[qo + 3];
      const h = dt / 2;
      let nx = x + h * (wx * qw + wy * z - wz * y);
      let ny = y + h * (wy * qw + wz * x - wx * z);
      let nz = z + h * (wz * qw + wx * y - wy * x);
      let nw = qw - h * (wx * x + wy * y + wz * z);
      const len = Math.hypot(nx, ny, nz, nw) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      nw /= len;
      q[qo] = nx;
      q[qo + 1] = ny;
      q[qo + 2] = nz;
      q[qo + 3] = nw;
      s.updateWorldInertia(i);
    }
    this.sleep(w, dt);
    s.force.fill(0, 0, s.count * 3);
    s.torque.fill(0, 0, s.count * 3);
    // This step's contacts, with their impulses, warm start the next step
    const t = this.previous;
    this.previous = this.contacts;
    this.contacts = t;
  }

  /** Applies impulse j to B and -j to A at the contact. */
  private applyImpulse(w: RigidWorld, a: number, kind: number, b: number, o: number, jx: number, jy: number, jz: number): void {
    const s = w.rigid;
    const f = this.contacts.floats;
    const ia = s.invMass[a];
    s.vel[a * 3] -= jx * ia;
    s.vel[a * 3 + 1] -= jy * ia;
    s.vel[a * 3 + 2] -= jz * ia;
    const rax = f[o + RA];
    const ray = f[o + RA + 1];
    const raz = f[o + RA + 2];
    s.addAngular(a, -(ray * jz - raz * jy), -(raz * jx - rax * jz), -(rax * jy - ray * jx));
    if (kind === RIGID) {
      const ib = s.invMass[b];
      s.vel[b * 3] += jx * ib;
      s.vel[b * 3 + 1] += jy * ib;
      s.vel[b * 3 + 2] += jz * ib;
      const rbx = f[o + RB];
      const rby = f[o + RB + 1];
      const rbz = f[o + RB + 2];
      s.addAngular(b, rby * jz - rbz * jy, rbz * jx - rbx * jz, rbx * jy - rby * jx);
    } else if (kind === PARTICLE) {
      const bodies = w.bodies;
      const ib = bodies.invMass[b];
      bodies.vel[b * 3] += jx * ib;
      bodies.vel[b * 3 + 1] += jy * ib;
      bodies.vel[b * 3 + 2] += jz * ib;
    }
  }

  /** Effective masses, tangents, target velocities and warm starting for this step's contacts. */
  private prepare(w: RigidWorld, dt: number): void {
    const s = w.rigid;
    const bodies = w.bodies;
    const st = this.settings;
    const buf = this.contacts;
    const ints = buf.ints;
    const f = buf.floats;
    const restThreshold = Math.max(2 * Math.hypot(w.gravity.x, w.gravity.y, w.gravity.z) * dt, 0.05);
    for (let k = 0; k < buf.count; k++) {
      const a = ints[k * NI];
      const kind = ints[k * NI + 1];
      const b = ints[k * NI + 2];
      const o = k * NF;
      const nx = f[o + N];
      const ny = f[o + N + 1];
      const nz = f[o + N + 2];
      const px = f[o + P];
      const py = f[o + P + 1];
      const pz = f[o + P + 2];
      f[o + RA] = px - s.pos[a * 3];
      f[o + RA + 1] = py - s.pos[a * 3 + 1];
      f[o + RA + 2] = pz - s.pos[a * 3 + 2];
      let wb = 0;
      if (kind === RIGID) {
        f[o + RB] = px - s.pos[b * 3];
        f[o + RB + 1] = py - s.pos[b * 3 + 1];
        f[o + RB + 2] = pz - s.pos[b * 3 + 2];
        wb = s.invMass[b];
      } else if (kind === PARTICLE) {
        wb = bodies.invMass[b];
      }
      // Tangent basis from the normal (the same normal always gives the same tangents)
      let t1x: number;
      let t1y: number;
      let t1z: number;
      if (Math.abs(nx) < 0.57) {
        t1x = 0;
        t1y = nz;
        t1z = -ny;
      } else {
        t1x = -nz;
        t1y = 0;
        t1z = nx;
      }
      const tl = Math.hypot(t1x, t1y, t1z);
      t1x /= tl;
      t1y /= tl;
      t1z /= tl;
      f[o + T1] = t1x;
      f[o + T1 + 1] = t1y;
      f[o + T1 + 2] = t1z;
      f[o + T2] = ny * t1z - nz * t1y;
      f[o + T2 + 1] = nz * t1x - nx * t1z;
      f[o + T2 + 2] = nx * t1y - ny * t1x;

      const wa = s.invMass[a];
      for (let row = 0; row < 3; row++) {
        const d = o + (row === 0 ? N : row === 1 ? T1 : T2);
        let kSum = wa + wb + this.angularMass(s, a, f, o + RA, f[d], f[d + 1], f[d + 2]);
        if (kind === RIGID) kSum += this.angularMass(s, b, f, o + RB, f[d], f[d + 1], f[d + 2]);
        f[o + (row === 0 ? MN : row === 1 ? MT1 : MT2)] = kSum > 0 ? 1 / kSum : 0;
      }

      // Normal velocity now (B minus A), for restitution
      this.relativeVelocity(w, a, kind, b, o);
      const vn = this.rv[0] * nx + this.rv[1] * ny + this.rv[2] * nz;
      const sep = f[o + SEP];
      let target: number;
      if (sep > 0) {
        // Not touching yet: may close the gap this step, no more
        target = -sep / dt;
      } else {
        target = (st.baumgarte * Math.max(-sep - st.slop, 0)) / dt;
        if (vn < -restThreshold) target = Math.max(target, -f[o + E] * vn);
      }
      f[o + TARGET] = target;
    }
    this.warmStart(w);
  }

  /** (I⁻¹ (r x d)) . (r x d) for body i, with r at f[ro..]. */
  private angularMass(s: RigidBodyStore, i: number, f: Float64Array, ro: number, dx: number, dy: number, dz: number): number {
    const rx = f[ro];
    const ry = f[ro + 1];
    const rz = f[ro + 2];
    const cx = ry * dz - rz * dy;
    const cy = rz * dx - rx * dz;
    const cz = rx * dy - ry * dx;
    const m = s.invInertiaWorld;
    const o = i * 9;
    return (
      cx * (m[o] * cx + m[o + 1] * cy + m[o + 2] * cz) +
      cy * (m[o + 3] * cx + m[o + 4] * cy + m[o + 5] * cz) +
      cz * (m[o + 6] * cx + m[o + 7] * cy + m[o + 8] * cz)
    );
  }

  /** Hash index over last step's contacts by pair, for warm starting. */
  private indexPrevious(): void {
    const prev = this.previous;
    let size = 64;
    while (size < prev.count * 2) size *= 2;
    if (this.table.length !== size) {
      this.table = new Int32Array(size);
      this.tableKeys = new Int32Array(size * 3);
      this.tableCount = new Int32Array(size);
    }
    this.table.fill(-1);
    const mask = size - 1;
    const ints = prev.ints;
    for (let k = 0; k < prev.count; k++) {
      const keyA = ints[k * NI + 3];
      const kind = ints[k * NI + 1];
      const keyB = ints[k * NI + 4];
      let h = pairHash(keyA, kind, keyB, mask);
      for (;;) {
        const first = this.table[h];
        if (first < 0) {
          this.table[h] = k;
          this.tableKeys[h * 3] = keyA;
          this.tableKeys[h * 3 + 1] = kind;
          this.tableKeys[h * 3 + 2] = keyB;
          this.tableCount[h] = 1;
          break;
        }
        if (this.tableKeys[h * 3] === keyA && this.tableKeys[h * 3 + 1] === kind && this.tableKeys[h * 3 + 2] === keyB) {
          // Contacts of a pair are stored next to each other
          this.tableCount[h]++;
          break;
        }
        h = (h + 1) & mask;
      }
    }
  }

  /** Starts every contact from the impulses of the matching contact last step, and applies them. */
  private warmStart(w: RigidWorld): void {
    const s = w.rigid;
    const buf = this.contacts;
    const prev = this.previous;
    const ints = buf.ints;
    const f = buf.floats;
    const pf = prev.floats;
    const mask = this.table.length - 1;
    for (let k = 0; k < buf.count; k++) {
      const keyA = ints[k * NI + 3];
      const kind = ints[k * NI + 1];
      const keyB = ints[k * NI + 4];
      const a = ints[k * NI];
      const o = k * NF;
      let h = pairHash(keyA, kind, keyB, mask);
      let first = -1;
      let count = 0;
      while (this.table[h] >= 0) {
        if (this.tableKeys[h * 3] === keyA && this.tableKeys[h * 3 + 1] === kind && this.tableKeys[h * 3 + 2] === keyB) {
          first = this.table[h];
          count = this.tableCount[h];
          break;
        }
        h = (h + 1) & mask;
      }
      if (first < 0) continue;
      // Same spot on body A (within a few percent of its size)
      const tol = Math.max(0.01, s.radius[a] * 0.05);
      let best = tol * tol;
      let match = -1;
      for (let q = first; q < first + count; q++) {
        const po = q * NF;
        const d =
          (pf[po + LOCAL] - f[o + LOCAL]) ** 2 + (pf[po + LOCAL + 1] - f[o + LOCAL + 1]) ** 2 + (pf[po + LOCAL + 2] - f[o + LOCAL + 2]) ** 2;
        if (d < best) {
          best = d;
          match = q;
        }
      }
      if (match < 0) continue;
      const po = match * NF;
      const ln = pf[po + LN];
      const l1 = pf[po + LT1];
      const l2 = pf[po + LT2];
      f[o + LN] = ln;
      f[o + LT1] = l1;
      f[o + LT2] = l2;
      const b = ints[k * NI + 2];
      this.applyImpulse(
        w,
        a,
        kind,
        b,
        o,
        f[o + N] * ln + f[o + T1] * l1 + f[o + T2] * l2,
        f[o + N + 1] * ln + f[o + T1 + 1] * l1 + f[o + T2 + 1] * l2,
        f[o + N + 2] * ln + f[o + T1 + 2] * l1 + f[o + T2 + 2] * l2,
      );
    }
  }

  /** Writes the manifold's points as contacts between rigid body a and b. */
  private pushManifold(w: RigidWorld, a: number, kind: number, b: number, keyA: number, keyB: number, frictionB: number, restitutionB: number): void {
    const s = w.rigid;
    const m = this.manifold;
    const buf = this.contacts;
    const mu = Math.sqrt(Math.max(s.friction[a], 0) * Math.max(frictionB, 0));
    const e = Math.max(s.restitution[a], restitutionB);
    const r = this.rot;
    const ro = a * 9;
    for (let k = 0; k < m.count; k++) {
      const c = buf.push(a, kind, b, keyA, keyB);
      const o = c * NF;
      const f = buf.floats;
      f[o + N] = m.nx;
      f[o + N + 1] = m.ny;
      f[o + N + 2] = m.nz;
      const px = m.points[k * 3];
      const py = m.points[k * 3 + 1];
      const pz = m.points[k * 3 + 2];
      f[o + P] = px;
      f[o + P + 1] = py;
      f[o + P + 2] = pz;
      f[o + SEP] = m.separation[k];
      f[o + MU] = mu;
      f[o + E] = e;
      // The point in A's frame: R^T (p - center)
      const dx = px - s.pos[a * 3];
      const dy = py - s.pos[a * 3 + 1];
      const dz = pz - s.pos[a * 3 + 2];
      f[o + LOCAL] = r[ro] * dx + r[ro + 3] * dy + r[ro + 6] * dz;
      f[o + LOCAL + 1] = r[ro + 1] * dx + r[ro + 4] * dy + r[ro + 7] * dz;
      f[o + LOCAL + 2] = r[ro + 2] * dx + r[ro + 5] * dy + r[ro + 8] * dz;
    }
  }

  /** Contacts of rigid bodies i and j into the manifold (normal from i to j). Returns whether there are any. */
  private collideRigid(s: RigidBodyStore, i: number, j: number): boolean {
    let a = i;
    let b = j;
    let ta = s.shape[a];
    let tb = s.shape[b];
    // Order the pair as (sphere, capsule, box) so each combination has one routine
    const flip = rank(ta) > rank(tb);
    if (flip) {
      a = j;
      b = i;
      ta = s.shape[a];
      tb = s.shape[b];
    }
    const m = this.manifold;
    const margin = this.settings.margin;
    const pos = s.pos;
    const dims = s.dims;
    const r = this.rot;
    if (ta === ShapeType.Sphere) {
      const ax = pos[a * 3];
      const ay = pos[a * 3 + 1];
      const az = pos[a * 3 + 2];
      const radius = dims[a * 3];
      if (tb === ShapeType.Sphere) sphereSphere(ax, ay, az, radius, pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], dims[b * 3], margin, m);
      else if (tb === ShapeType.Box) sphereBox(ax, ay, az, radius, pos, b * 3, r, b * 9, dims, b * 3, margin, m);
      else {
        this.segment(s, b, this.capsule);
        capsuleSphere(this.capsule, dims[b * 3], ax, ay, az, radius, margin, m);
        m.flip();
      }
    } else if (ta === ShapeType.Capsule) {
      this.segment(s, a, this.capsule);
      if (tb === ShapeType.Capsule) {
        this.segment(s, b, this.capsuleB);
        capsuleCapsule(this.capsule, dims[a * 3], this.capsuleB, dims[b * 3], margin, m);
      } else {
        capsuleBox(this.capsule, dims[a * 3], pos, b * 3, r, b * 9, dims, b * 3, margin, m);
      }
    } else {
      boxBox(pos, a * 3, r, a * 9, dims, a * 3, pos, b * 3, r, b * 9, dims, b * 3, margin, m);
    }
    if (flip) m.flip();
    return m.count > 0;
  }

  /** Contacts of rigid body i (A) with a sphere (B) at (x, y, z). */
  private collideSphere(s: RigidBodyStore, i: number, x: number, y: number, z: number, radius: number): boolean {
    const m = this.manifold;
    const margin = this.settings.margin;
    const t = s.shape[i];
    const pos = s.pos;
    if (t === ShapeType.Sphere) sphereSphere(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], s.dims[i * 3], x, y, z, radius, margin, m);
    else if (t === ShapeType.Capsule) {
      this.segment(s, i, this.capsule);
      capsuleSphere(this.capsule, s.dims[i * 3], x, y, z, radius, margin, m);
    } else {
      // Box as B: run sphere (A) vs box and flip so the normal points from the box to the sphere
      sphereBox(x, y, z, radius, pos, i * 3, this.rot, i * 9, s.dims, i * 3, margin, m);
      m.flip();
    }
    return m.count > 0;
  }

  /** Contacts of dynamic rigid body i with one of the world's colliders. */
  private collideCollider(w: RigidWorld, i: number, c: Collider, index: number): void {
    const s = w.rigid;
    if (c instanceof PlaneCollider) {
      if (!this.shapePlane(s, i, c.normal.x, c.normal.y, c.normal.z, c.offset)) return;
      this.pushFixed(w, i, -1 - index * 8, c.friction ?? w.friction, c.restitution ?? w.restitution, null);
    } else if (c instanceof SphereCollider) {
      if (c.inside) return;
      if (!this.collideSphere(s, i, c.center.x, c.center.y, c.center.z, c.radius)) return;
      this.pushFixed(w, i, -1 - index * 8, c.friction ?? w.friction, c.restitution ?? w.restitution, null);
    } else if (c instanceof BoxContainer) {
      // Only bodies inside the box: each wall is then a plane facing inward
      const center = c.transform.position;
      const h = c.halfExtents;
      const o = i * 3;
      const dx = s.pos[o] - center.x;
      const dy = s.pos[o + 1] - center.y;
      const dz = s.pos[o + 2] - center.z;
      for (let k = 0; k < 3; k++) {
        const a = k === 0 ? c.axisX : k === 1 ? c.axisY : c.axisZ;
        const half = k === 0 ? h.x : k === 1 ? h.y : h.z;
        if (Math.abs(dx * a.x + dy * a.y + dz * a.z) > half + s.radius[i]) return;
      }
      for (let k = 0; k < 3; k++) {
        const a = k === 0 ? c.axisX : k === 1 ? c.axisY : c.axisZ;
        const half = k === 0 ? h.x : k === 1 ? h.y : h.z;
        const along = center.x * a.x + center.y * a.y + center.z * a.z;
        for (let side = 0; side < 2; side++) {
          // The wall at +half faces -axis, the one at -half faces +axis
          const sgn = side === 0 ? -1 : 1;
          if (!this.shapePlane(s, i, a.x * sgn, a.y * sgn, a.z * sgn, sgn * along - half)) continue;
          this.pushFixed(w, i, -1 - (index * 8 + k * 2 + side), c.friction ?? w.friction, c.restitution ?? w.restitution, c);
        }
      }
    } else if (c.rigidShapes) {
      // A custom collider reports its shapes near the body; all its contacts share one key, and warm
      // starting matches them by their point on the body
      this.sinkWorld = w;
      this.sinkBody = i;
      this.sinkKey = -1 - (index * 8 + 6);
      this.sinkFriction = c.friction ?? w.friction;
      this.sinkRestitution = c.restitution ?? w.restitution;
      const o = i * 3;
      c.rigidShapes(s.pos[o], s.pos[o + 1], s.pos[o + 2], s.radius[i] + this.settings.margin, this.sink);
      this.sinkWorld = null;
    }
  }

  private pushSinkContacts(w: RigidWorld): void {
    this.pushFixed(w, this.sinkBody, this.sinkKey, this.sinkFriction, this.sinkRestitution, null);
  }

  /** Contacts of rigid body i (A) with a fixed axis-aligned box (B). */
  private collideStaticBox(s: RigidBodyStore, i: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): boolean {
    const m = this.manifold;
    const margin = this.settings.margin;
    const c = this.boxCenter;
    const h = this.boxHalf;
    c[0] = cx;
    c[1] = cy;
    c[2] = cz;
    h[0] = hx;
    h[1] = hy;
    h[2] = hz;
    const t = s.shape[i];
    const pos = s.pos;
    if (t === ShapeType.Sphere) {
      sphereBox(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], s.dims[i * 3], c, 0, IDENTITY, 0, h, 0, margin, m);
    } else if (t === ShapeType.Capsule) {
      this.segment(s, i, this.capsule);
      capsuleBox(this.capsule, s.dims[i * 3], c, 0, IDENTITY, 0, h, 0, margin, m);
    } else {
      boxBox(pos, i * 3, this.rot, i * 9, s.dims, i * 3, c, 0, IDENTITY, 0, h, 0, margin, m);
    }
    return m.count > 0;
  }

  /** Manifold contacts with a fixed surface; the box container's walls move with its kinematic velocity. */
  private pushFixed(w: RigidWorld, i: number, key: number, friction: number, restitution: number, box: BoxContainer | null): void {
    const before = this.contacts.count;
    this.pushManifold(w, i, FIXED, -1, w.rigid.ids[i], key, friction, restitution);
    if (!box) return;
    const f = this.contacts.floats;
    const c = box.transform.position;
    const lv = box.linearVelocity;
    const av = box.angularVelocity;
    let moving = false;
    for (let k = before; k < this.contacts.count; k++) {
      const o = k * NF;
      const rx = f[o + P] - c.x;
      const ry = f[o + P + 1] - c.y;
      const rz = f[o + P + 2] - c.z;
      let vx = lv.x + av.y * rz - av.z * ry;
      let vy = lv.y + av.z * rx - av.x * rz;
      let vz = lv.z + av.x * ry - av.y * rx;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > box.maxTransferSpeed) {
        const k2 = box.maxTransferSpeed / speed;
        vx *= k2;
        vy *= k2;
        vz *= k2;
      }
      f[o + WV] = vx;
      f[o + WV + 1] = vy;
      f[o + WV + 2] = vz;
      if (speed > this.settings.sleepLinear) moving = true;
    }
    if (moving) this.restless[i] = 1;
  }

  /** Shape of body i against the plane dot(n, p) = offset (bodies stay on the side n points to). */
  private shapePlane(s: RigidBodyStore, i: number, nx: number, ny: number, nz: number, offset: number): boolean {
    const m = this.manifold;
    const margin = this.settings.margin;
    const t = s.shape[i];
    const reach = nx * s.pos[i * 3] + ny * s.pos[i * 3 + 1] + nz * s.pos[i * 3 + 2] - offset - s.radius[i];
    if (reach > margin) {
      m.reset();
      return false;
    }
    if (t === ShapeType.Sphere) pointsPlane(s.pos.subarray(i * 3, i * 3 + 3), 1, s.dims[i * 3], nx, ny, nz, offset, margin, m);
    else if (t === ShapeType.Capsule) {
      this.segment(s, i, this.capsule);
      pointsPlane(this.capsule, 2, s.dims[i * 3], nx, ny, nz, offset, margin, m);
    } else {
      boxCorners(s.pos, i * 3, this.rot, i * 9, s.dims, i * 3, this.corners);
      pointsPlane(this.corners, 8, 0, nx, ny, nz, offset, margin, m);
    }
    return m.count > 0;
  }

  /** End points of capsule i's segment (world). */
  private segment(s: RigidBodyStore, i: number, out: Float64Array): void {
    const r = this.rot;
    const h = s.dims[i * 3 + 1];
    // Local y axis in world space: column 1 of the rotation
    const ux = r[i * 9 + 1] * h;
    const uy = r[i * 9 + 4] * h;
    const uz = r[i * 9 + 7] * h;
    const o = i * 3;
    out[0] = s.pos[o] - ux;
    out[1] = s.pos[o + 1] - uy;
    out[2] = s.pos[o + 2] - uz;
    out[3] = s.pos[o] + ux;
    out[4] = s.pos[o + 1] + uy;
    out[5] = s.pos[o + 2] + uz;
  }

  private rotation(s: RigidBodyStore, i: number): void {
    const q = s.quat;
    const x = q[i * 4];
    const y = q[i * 4 + 1];
    const z = q[i * 4 + 2];
    const w = q[i * 4 + 3];
    const r = this.rot;
    const o = i * 9;
    r[o] = 1 - 2 * (y * y + z * z);
    r[o + 1] = 2 * (x * y - z * w);
    r[o + 2] = 2 * (x * z + y * w);
    r[o + 3] = 2 * (x * y + z * w);
    r[o + 4] = 1 - 2 * (x * x + z * z);
    r[o + 5] = 2 * (y * z - x * w);
    r[o + 6] = 2 * (x * z - y * w);
    r[o + 7] = 2 * (y * z + x * w);
    r[o + 8] = 1 - 2 * (x * x + y * y);
  }

  /** Groups of touching dynamic bodies that have all been still long enough fall asleep together. */
  private sleep(w: RigidWorld, dt: number): void {
    const s = w.rigid;
    const st = this.settings;
    const n = s.count;
    const parent = this.parent;
    const lin2 = st.sleepLinear * st.sleepLinear;
    const ang2 = st.sleepAngular * st.sleepAngular;
    let sleeping = 0;
    for (let i = 0; i < n; i++) {
      parent[i] = i;
      if (!s.isDynamic(i)) continue;
      if (s.flags[i] & RigidFlags.Sleeping) {
        sleeping++;
        continue;
      }
      const o = i * 3;
      const v2 = s.vel[o] ** 2 + s.vel[o + 1] ** 2 + s.vel[o + 2] ** 2;
      const w2 = s.angVel[o] ** 2 + s.angVel[o + 1] ** 2 + s.angVel[o + 2] ** 2;
      if (st.sleep && v2 < lin2 && w2 < ang2) s.sleepTime[i] += dt;
      else s.sleepTime[i] = 0;
    }
    this.stats.sleeping = sleeping;
    if (!st.sleep) return;

    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const buf = this.contacts;
    const ints = buf.ints;
    const restless = this.restless;
    for (let k = 0; k < buf.count; k++) {
      const a = ints[k * NI];
      const kind = ints[k * NI + 1];
      const b = ints[k * NI + 2];
      if (kind === RIGID && s.isDynamic(a) && s.isDynamic(b)) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      } else if (kind === RIGID && s.flags[b] & RigidFlags.Kinematic) {
        restless[a] = 1;
      } else if (kind === RIGID && s.flags[a] & RigidFlags.Kinematic) {
        restless[b] = 1;
      } else if (kind === PARTICLE) {
        const bodies = w.bodies;
        const v2 = bodies.vel[b * 3] ** 2 + bodies.vel[b * 3 + 1] ** 2 + bodies.vel[b * 3 + 2] ** 2;
        if (v2 > lin2) restless[a] = 1;
      }
    }
    // An island sleeps when its least still body has been still long enough and nothing moves it
    const time = this.islandTime;
    for (let i = 0; i < n; i++) time[i] = Infinity;
    for (let i = 0; i < n; i++) {
      if (!s.isDynamic(i) || s.flags[i] & RigidFlags.Sleeping) continue;
      const root = find(i);
      const t = restless[i] ? 0 : s.sleepTime[i];
      if (t < time[root]) time[root] = t;
    }
    for (let i = 0; i < n; i++) {
      if (!s.isDynamic(i) || s.flags[i] & RigidFlags.Sleeping) continue;
      if (time[find(i)] < st.sleepTime) continue;
      s.flags[i] |= RigidFlags.Sleeping;
      s.vel.fill(0, i * 3, i * 3 + 3);
      s.angVel.fill(0, i * 3, i * 3 + 3);
    }
  }
}

function rank(shape: number): number {
  return shape === ShapeType.Sphere ? 0 : shape === ShapeType.Capsule ? 1 : 2;
}
