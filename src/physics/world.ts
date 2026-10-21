import type { Vec3 } from "../math/vec3.js";
import { HashGrid, type BroadphaseOptions } from "./broadphase.js";
import { BodyStore } from "./bodyStore.js";
import { solveContacts } from "./contacts.js";
import { integratePositions, integrateVelocities } from "./integrate.js";
import { raySphere } from "./raycast.js";
import { RigidPipeline, type RigidSettings } from "./rigid/rigidPipeline.js";
import { RigidBodyStore, type RigidBodyId, type RigidBodyOptions } from "./rigid/rigidStore.js";
import {
  BodyFlags,
  type BodyId,
  type BodyOptions,
  type Collider,
  type Constraint,
  type ForceGenerator,
  type Precision,
  type SolverSettings,
} from "./types.js";

export interface WorldOptions {
  /** Default (0, -9.8, 0). */
  gravity?: Vec3;
  /** Fixed physics step in seconds. Default 1/120. */
  fixedDt?: number;
  /** Most fixed steps per step() call; the rest of a long frame is dropped. Default 8. */
  maxSubSteps?: number;
  /** Solver iterations per fixed step. More iterations keep deep piles from sinking into each other. Default 8. */
  iterations?: number;
  restitution?: number;
  friction?: number;
  /** Velocity damping per second. Default 0. */
  linearDamping?: number;
  /** Simulation speed multiplier. Default 1. */
  timeScale?: number;
  /** Float precision of the body arrays. Default "f32". */
  precision?: Precision;
  initialCapacity?: number;
  broadphase?: BroadphaseOptions;
  /** Rigid body solver settings (contact margin, sleeping, damping...). */
  rigid?: Partial<RigidSettings>;
}

export interface RaycastHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
  /** The body hit, or -1 when a collider was hit. */
  body: BodyId;
  collider: Collider | null;
}

/** Called once per fixed step, with the step's dt. */
export type StepListener = (dt: number, world: World) => void;

export interface StepStats {
  /** Fixed steps run by the last step() call. */
  substeps: number;
  bodies: number;
  pairs: number;
  /** Milliseconds spent in the last step() call, total and in the broadphase. */
  stepMs: number;
  broadphaseMs: number;
  rigidBodies: number;
  /** Rigid contact points solved in the last fixed step. */
  rigidContacts: number;
}

/**
 * The physics world: bodies in a structure-of-arrays store, forces, colliders and constraints, advanced
 * with a fixed timestep so the simulation behaves the same at any frame rate.
 */
export class World {
  readonly bodies: BodyStore;
  readonly broadphase: HashGrid;
  /** Rigid bodies (boxes, spheres, capsules that rotate), simulated alongside the particles. */
  readonly rigid: RigidBodyStore = new RigidBodyStore();
  readonly rigidPipeline: RigidPipeline = new RigidPipeline();
  gravity: Vec3;
  fixedDt: number;
  maxSubSteps: number;
  iterations: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  timeScale: number;
  /** Simulated time in seconds. */
  time: number = 0;
  readonly colliders: Collider[] = [];
  readonly forces: ForceGenerator[] = [];
  readonly constraints: Constraint[] = [];
  readonly stats: StepStats = {
    substeps: 0,
    bodies: 0,
    pairs: 0,
    stepMs: 0,
    broadphaseMs: 0,
    rigidBodies: 0,
    rigidContacts: 0,
  };
  /** Solver parameters, refreshed every fixed step from the fields above. */
  readonly settings: SolverSettings = {
    restitution: 0,
    friction: 0,
    positionCorrection: 1,
    slop: 0.01,
    restThreshold: 0,
  };
  private accumulator: number = 0;
  private readonly beforeStep: StepListener[] = [];
  private readonly afterStep: StepListener[] = [];
  private nextGroup: number = 1;

  constructor(options: WorldOptions = {}) {
    this.bodies = new BodyStore(options.precision ?? "f32", options.initialCapacity ?? 256);
    this.broadphase = new HashGrid(options.broadphase);
    this.gravity = options.gravity ?? { x: 0, y: -9.8, z: 0 };
    this.fixedDt = options.fixedDt ?? 1 / 120;
    this.maxSubSteps = options.maxSubSteps ?? 8;
    this.iterations = options.iterations ?? 8;
    this.restitution = options.restitution ?? 0.5;
    this.friction = options.friction ?? 0;
    this.linearDamping = options.linearDamping ?? 0;
    this.timeScale = options.timeScale ?? 1;
    if (options.rigid) Object.assign(this.rigidPipeline.settings, options.rigid);
  }

  /**
   * Adds a rigid body. Restitution and friction default to the world's (friction 0.5 when the world has
   * none: rigid bodies without friction slide and spin forever). Returns its id; use world.rigid to read
   * and change it.
   */
  addRigidBody(o: RigidBodyOptions): RigidBodyId {
    return this.rigid.add(o, this.restitution, this.friction > 0 ? this.friction : 0.5);
  }

  removeRigidBody(id: RigidBodyId): boolean {
    return this.rigid.remove(id);
  }

  addBody(o: BodyOptions): BodyId {
    const radius = o.radius ?? 0;
    let flags = 0;
    if (o.collides ?? radius > 0) flags |= BodyFlags.Collides;
    if (o.isStatic) flags |= BodyFlags.Static;
    const v = o.velocity;
    return this.bodies.add(
      o.position.x,
      o.position.y,
      o.position.z,
      v ? v.x : 0,
      v ? v.y : 0,
      v ? v.z : 0,
      radius,
      o.mass ?? 1,
      flags,
      o.group ?? 0,
    );
  }

  /** Reserves a collision group (1-31) not handed out before; group 0 is the default. */
  createGroup(): number {
    if (this.nextGroup > 31) throw new Error("All 32 collision groups are in use.");
    return this.nextGroup++;
  }

  /** Whether bodies of group a collide with bodies of group b (both ways). Everything collides by default. */
  setCollision(a: number, b: number, collide: boolean): void {
    const bp = this.broadphase;
    const masks = bp.collisionMask ?? new Uint32Array(32).fill(0xffffffff);
    if (collide) {
      masks[a] |= 1 << b;
      masks[b] |= 1 << a;
    } else {
      masks[a] &= ~(1 << b);
      masks[b] &= ~(1 << a);
    }
    bp.collisionMask = masks.every((m) => m === 0xffffffff) ? null : masks;
  }

  canCollide(a: number, b: number): boolean {
    const masks = this.broadphase.collisionMask;
    return masks === null || ((masks[a] >>> b) & 1) === 1;
  }

  /** Runs `listener` at the start of every fixed step (before forces). Returns a function that removes it. */
  onBeforeStep(listener: StepListener): () => void {
    this.beforeStep.push(listener);
    return () => remove(this.beforeStep, listener);
  }

  /** Runs `listener` at the end of every fixed step. Returns a function that removes it. */
  onAfterStep(listener: StepListener): () => void {
    this.afterStep.push(listener);
    return () => remove(this.afterStep, listener);
  }

  removeBody(id: BodyId): boolean {
    return this.bodies.remove(id);
  }

  addCollider<T extends Collider>(c: T): T {
    this.colliders.push(c);
    return c;
  }

  removeCollider(c: Collider): void {
    remove(this.colliders, c);
  }

  addForce<T extends ForceGenerator>(f: T): T {
    this.forces.push(f);
    return f;
  }

  removeForce(f: ForceGenerator): void {
    remove(this.forces, f);
  }

  addConstraint<T extends Constraint>(c: T): T {
    this.constraints.push(c);
    return c;
  }

  removeConstraint(c: Constraint): void {
    remove(this.constraints, c);
  }

  getPosition(id: BodyId, out: Vec3): Vec3 {
    const o = this.index(id) * 3;
    const p = this.bodies.pos;
    out.x = p[o];
    out.y = p[o + 1];
    out.z = p[o + 2];
    return out;
  }

  setPosition(id: BodyId, v: Vec3): void {
    const o = this.index(id) * 3;
    const p = this.bodies.pos;
    p[o] = v.x;
    p[o + 1] = v.y;
    p[o + 2] = v.z;
  }

  getVelocity(id: BodyId, out: Vec3): Vec3 {
    const o = this.index(id) * 3;
    const v = this.bodies.vel;
    out.x = v[o];
    out.y = v[o + 1];
    out.z = v[o + 2];
    return out;
  }

  setVelocity(id: BodyId, v: Vec3): void {
    const o = this.index(id) * 3;
    const vel = this.bodies.vel;
    vel[o] = v.x;
    vel[o + 1] = v.y;
    vel[o + 2] = v.z;
  }

  /** Instant change of momentum: v += j / m. */
  applyImpulse(id: BodyId, j: Vec3): void {
    const i = this.index(id);
    const w = this.bodies.invMass[i];
    const vel = this.bodies.vel;
    vel[i * 3] += j.x * w;
    vel[i * 3 + 1] += j.y * w;
    vel[i * 3 + 2] += j.z * w;
  }

  /** Adds a force for the next fixed step only. */
  applyForce(id: BodyId, f: Vec3): void {
    const o = this.index(id) * 3;
    const force = this.bodies.force;
    force[o] += f.x;
    force[o + 1] += f.y;
    force[o + 2] += f.z;
  }

  setStatic(id: BodyId, isStatic: boolean): void {
    this.bodies.setStatic(this.index(id), isStatic);
  }

  /**
   * Closest body (with radius > 0) or collider hit by a ray, for picking. `dir` must be unit length.
   * Bodies are tested one by one, so it suits occasional queries like clicks, not every frame for every body.
   */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number = Infinity, out?: RaycastHit): RaycastHit | null {
    let best = maxDistance;
    let body = -1;
    let collider: Collider | null = null;
    const normal = { x: 0, y: 0, z: 0 };
    const s = this.bodies;
    for (let i = 0; i < s.count; i++) {
      const r = s.radius[i];
      if (!(r > 0)) continue;
      const o = i * 3;
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, s.pos[o], s.pos[o + 1], s.pos[o + 2], r);
      if (t >= 0 && t < best) {
        best = t;
        body = s.ids[i];
      }
    }
    const n = { x: 0, y: 0, z: 0 };
    for (const c of this.colliders) {
      if (!c.raycast) continue;
      const t = c.raycast(origin, dir, n);
      if (t >= 0 && t < best) {
        best = t;
        body = -1;
        collider = c;
        normal.x = n.x;
        normal.y = n.y;
        normal.z = n.z;
      }
    }
    if (body < 0 && collider === null) return null;

    const hit: RaycastHit = out ?? { distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, body: -1, collider: null };
    hit.distance = best;
    hit.point.x = origin.x + dir.x * best;
    hit.point.y = origin.y + dir.y * best;
    hit.point.z = origin.z + dir.z * best;
    hit.body = body;
    hit.collider = collider;
    if (body >= 0) {
      const o = s.indexOf(body) * 3;
      const r = s.radius[s.indexOf(body)];
      normal.x = (hit.point.x - s.pos[o]) / r;
      normal.y = (hit.point.y - s.pos[o + 1]) / r;
      normal.z = (hit.point.z - s.pos[o + 2]) / r;
    }
    hit.normal.x = normal.x;
    hit.normal.y = normal.y;
    hit.normal.z = normal.z;
    return hit;
  }

  /**
   * Advances by a frame's worth of time in fixed steps. Leftover time carries over to the next call;
   * if a frame needs more than maxSubSteps, the backlog is dropped instead of spiralling.
   * Returns the number of fixed steps run.
   */
  step(frameDt: number): number {
    const start = performance.now();
    this.stats.broadphaseMs = 0;
    this.accumulator += Math.min(Math.max(frameDt, 0), 0.25) * this.timeScale;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      this.stepFixed(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (this.accumulator >= this.fixedDt) this.accumulator = 0;
    this.stats.substeps = steps;
    this.stats.stepMs = performance.now() - start;
    return steps;
  }

  /** One deterministic step of exactly dt seconds. */
  stepFixed(dt: number): void {
    const s = this.bodies;
    const set = this.settings;
    set.restitution = this.restitution;
    set.friction = this.friction;
    const g = this.gravity;
    set.restThreshold = Math.max(2 * Math.hypot(g.x, g.y, g.z) * dt, 1e-4);
    for (let k = 0; k < this.beforeStep.length; k++) this.beforeStep[k](dt, this);

    for (const f of this.forces) f.apply(s, dt, this.time);
    integrateVelocities(s, g, dt, this.linearDamping);
    // Rigid bodies only cost anything when there are some
    const rigid = this.rigid.count > 0 ? this.rigidPipeline : null;
    if (rigid) rigid.integrateVelocities(this, dt);
    integratePositions(s, dt);
    for (const c of this.colliders) c.update(dt);

    const t0 = performance.now();
    this.broadphase.build(s);
    this.broadphase.findPairs(s);
    this.stats.broadphaseMs += performance.now() - t0;
    if (rigid) rigid.detect(this, dt, this.broadphase.collisionMask);

    const pairs = this.broadphase.pairs;
    const pairCount = this.broadphase.pairCount;
    for (let it = 0; it < this.iterations; it++) {
      solveContacts(s, pairs, pairCount, set);
      for (const c of this.constraints) c.solve(s, dt);
      // Colliders last, so nothing ends a step outside its container
      for (const c of this.colliders) c.solve(s, set);
      if (rigid) rigid.solve(this);
    }
    if (rigid) rigid.integratePositions(this, dt);
    this.stats.rigidBodies = this.rigid.count;
    this.stats.rigidContacts = rigid ? rigid.stats.contacts : 0;

    s.force.fill(0, 0, s.count * 3);
    this.time += dt;
    this.stats.bodies = s.count;
    this.stats.pairs = pairCount;
    for (let k = 0; k < this.afterStep.length; k++) this.afterStep[k](dt, this);
  }

  private index(id: BodyId): number {
    const i = this.bodies.indexOf(id);
    if (i < 0) throw new Error(`Body ${id} does not exist.`);
    return i;
  }
}

function remove<T>(list: T[], item: T): void {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}
