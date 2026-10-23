import { BodyFlags, type BodyId, type Precision } from "./types.js";

export type FloatArray = Float32Array | Float64Array;

/**
 * All bodies in flat typed arrays (structure of arrays, issue #2) instead of one object per body:
 * no pointer chasing, contiguous memory, and buffers a renderer (or a GPU) can read directly.
 * Vector fields are packed xyz per body: pos[3 * i], pos[3 * i + 1], pos[3 * i + 2].
 *
 * Dense indices change when bodies are removed (swap-remove keeps the arrays packed); ids never do.
 * Growing reallocates the arrays, so never keep a reference to `pos` etc. across add().
 */
export class BodyStore {
  readonly precision: Precision;
  count: number = 0;
  capacity: number;
  pos: FloatArray;
  vel: FloatArray;
  /** Accumulated force for the current step, cleared after every step. */
  force: FloatArray;
  radius: FloatArray;
  mass: FloatArray;
  /** 0 for static bodies. */
  invMass: FloatArray;
  flags: Uint8Array;
  /** Collision group (0-31), see World.setCollision. */
  group: Uint8Array;
  /** Dense index -> id. */
  ids: Int32Array;
  /** Largest radius among colliding bodies (sizes the broadphase grid). */
  maxRadius: number = 0;
  private idToIndex: Int32Array = new Int32Array(0);
  private nextId: number = 0;

  constructor(precision: Precision = "f32", initialCapacity: number = 256) {
    this.precision = precision;
    const cap = Math.max(1, Math.floor(initialCapacity));
    this.capacity = cap;
    this.pos = this.floats(cap * 3);
    this.vel = this.floats(cap * 3);
    this.force = this.floats(cap * 3);
    this.radius = this.floats(cap);
    this.mass = this.floats(cap);
    this.invMass = this.floats(cap);
    this.flags = new Uint8Array(cap);
    this.group = new Uint8Array(cap);
    this.ids = new Int32Array(cap);
  }

  ensureCapacity(n: number): void {
    if (n <= this.capacity) return;
    let cap = this.capacity;
    while (cap < n) cap *= 2;
    const grow = (a: FloatArray, k: number): FloatArray => {
      const b = this.floats(cap * k);
      b.set(a);
      return b;
    };
    this.pos = grow(this.pos, 3);
    this.vel = grow(this.vel, 3);
    this.force = grow(this.force, 3);
    this.radius = grow(this.radius, 1);
    this.mass = grow(this.mass, 1);
    this.invMass = grow(this.invMass, 1);
    const flags = new Uint8Array(cap);
    flags.set(this.flags);
    this.flags = flags;
    const group = new Uint8Array(cap);
    group.set(this.group);
    this.group = group;
    const ids = new Int32Array(cap);
    ids.set(this.ids);
    this.ids = ids;
    this.capacity = cap;
  }

  add(
    px: number,
    py: number,
    pz: number,
    vx: number,
    vy: number,
    vz: number,
    radius: number,
    mass: number,
    flags: number,
    group: number = 0,
  ): BodyId {
    this.ensureCapacity(this.count + 1);
    const i = this.count++;
    const id = this.nextId++;
    if (id >= this.idToIndex.length) {
      const map = new Int32Array(Math.max(64, this.idToIndex.length * 2)).fill(-1);
      map.set(this.idToIndex);
      this.idToIndex = map;
    }
    this.idToIndex[id] = i;
    this.ids[i] = id;

    const o = i * 3;
    const isStatic = (flags & BodyFlags.Static) !== 0;
    this.pos[o] = px;
    this.pos[o + 1] = py;
    this.pos[o + 2] = pz;
    this.vel[o] = isStatic ? 0 : vx;
    this.vel[o + 1] = isStatic ? 0 : vy;
    this.vel[o + 2] = isStatic ? 0 : vz;
    this.force[o] = 0;
    this.force[o + 1] = 0;
    this.force[o + 2] = 0;
    this.radius[i] = radius;
    this.mass[i] = mass;
    this.invMass[i] = isStatic || !(mass > 0) ? 0 : 1 / mass;
    this.flags[i] = flags;
    this.group[i] = group;
    if (flags & BodyFlags.Collides && radius > this.maxRadius) this.maxRadius = radius;
    return id;
  }

  /** Removes a body by moving the last body into its slot. Returns false if the id is unknown. */
  remove(id: BodyId): boolean {
    const i = this.indexOf(id);
    if (i < 0) return false;
    const last = --this.count;
    const removedRadius = this.radius[i];
    const removedFlags = this.flags[i];
    if (i !== last) {
      this.copy(last, i);
      this.idToIndex[this.ids[i]] = i;
    }
    this.idToIndex[id] = -1;
    if (removedFlags & BodyFlags.Collides && removedRadius >= this.maxRadius) this.recomputeMaxRadius();
    return true;
  }

  /** Dense index of a body, or -1 if it was removed. */
  indexOf(id: BodyId): number {
    return id >= 0 && id < this.idToIndex.length ? this.idToIndex[id] : -1;
  }

  has(id: BodyId): boolean {
    return this.indexOf(id) >= 0;
  }

  setStatic(index: number, isStatic: boolean): void {
    if (isStatic) {
      this.flags[index] |= BodyFlags.Static;
      this.invMass[index] = 0;
      this.vel[index * 3] = 0;
      this.vel[index * 3 + 1] = 0;
      this.vel[index * 3 + 2] = 0;
    } else {
      this.flags[index] &= ~BodyFlags.Static;
      const m = this.mass[index];
      this.invMass[index] = m > 0 ? 1 / m : 0;
    }
  }

  setMass(index: number, mass: number): void {
    this.mass[index] = mass;
    this.invMass[index] = this.flags[index] & BodyFlags.Static || !(mass > 0) ? 0 : 1 / mass;
  }

  setRadius(index: number, radius: number): void {
    const old = this.radius[index];
    this.radius[index] = radius;
    if (!(this.flags[index] & BodyFlags.Collides)) return;
    if (radius > this.maxRadius) this.maxRadius = radius;
    else if (old >= this.maxRadius) this.recomputeMaxRadius();
  }

  setCollides(index: number, collides: boolean): void {
    if (collides) this.flags[index] |= BodyFlags.Collides;
    else this.flags[index] &= ~BodyFlags.Collides;
    this.recomputeMaxRadius();
  }

  recomputeMaxRadius(): void {
    let max = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.flags[i] & BodyFlags.Collides && this.radius[i] > max) max = this.radius[i];
    }
    this.maxRadius = max;
  }

  clear(): void {
    this.count = 0;
    this.maxRadius = 0;
    this.idToIndex.fill(-1);
  }

  private copy(from: number, to: number): void {
    const a = from * 3;
    const b = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[b + k] = this.pos[a + k];
      this.vel[b + k] = this.vel[a + k];
      this.force[b + k] = this.force[a + k];
    }
    this.radius[to] = this.radius[from];
    this.mass[to] = this.mass[from];
    this.invMass[to] = this.invMass[from];
    this.flags[to] = this.flags[from];
    this.group[to] = this.group[from];
    this.ids[to] = this.ids[from];
  }

  private floats(n: number): FloatArray {
    return this.precision === "f64" ? new Float64Array(n) : new Float32Array(n);
  }
}
