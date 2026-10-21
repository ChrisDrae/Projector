import type { Vec3 } from "../../math/vec3.js";
import type { BodyId } from "../../physics/types.js";
import { PointCloud, SphereCloud } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";
import type { Simulation } from "../simulation.js";

export interface ParticleGroupOptions {
  name?: string;
  /** Collision group (0-31). Default: a new group from world.createGroup(). */
  group?: number;
  /** Default radius of new particles. Default 0.01; 0 makes point particles. */
  radius?: number;
  mass?: number;
  /** Body-body collisions. Default: radius > 0. */
  collides?: boolean;
  /** Default: spheres when the radius is > 0, points otherwise. */
  render?: "spheres" | "points" | "none";
  color?: string;
  /** Several colors, picked per particle by colorIndex (called with the body's dense index). */
  palette?: string[];
  colorIndex?: ((index: number) => number) | null;
  depthCue?: number;
  shadeLevels?: number;
  minPixelRadius?: number;
  /** Point size in CSS pixels for render: "points". */
  pointSize?: number;
  layer?: number;
}

export interface ParticleOptions {
  position: Vec3;
  velocity?: Vec3;
  radius?: number;
  mass?: number;
  isStatic?: boolean;
  collides?: boolean;
}

const position: Vec3 = { x: 0, y: 0, z: 0 };
const velocity: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * A set of particles or spheres in the world's body store, drawn as one cloud. The bodies live in the
 * world's typed arrays like any other; the group remembers their ids and its collision group, so it can
 * draw, count and remove just its own. Particles can only be added once the group is in a simulation.
 */
export class ParticleGroup extends SimObject {
  readonly options: ParticleGroupOptions;
  group: number;
  /** The cloud drawing the group (null before the group is added, or with render: "none"). */
  node: SphereCloud | PointCloud | null = null;
  private ids: Int32Array = new Int32Array(64);
  private n: number = 0;

  constructor(options: ParticleGroupOptions = {}) {
    super({ name: options.name ?? "particles" });
    this.options = options;
    this.group = options.group ?? -1;
  }

  get count(): number {
    return this.n;
  }

  /** Id of the k-th particle of the group (0 <= k < count). */
  idAt(k: number): BodyId {
    return this.ids[k];
  }

  add(p: ParticleOptions): BodyId {
    const radius = p.radius ?? this.options.radius ?? 0.01;
    const id = this.requireSim.world.addBody({
      position: p.position,
      velocity: p.velocity,
      radius,
      mass: p.mass ?? this.options.mass ?? 1,
      isStatic: p.isStatic,
      collides: p.collides ?? this.options.collides ?? radius > 0,
      group: this.group,
    });
    if (this.n === this.ids.length) {
      const next = new Int32Array(this.ids.length * 2);
      next.set(this.ids);
      this.ids = next;
    }
    this.ids[this.n++] = id;
    return id;
  }

  /** Adds `count` particles; `place` sets each one's position (and optionally velocity, zero by default). */
  spawn(count: number, place: (i: number, position: Vec3, velocity: Vec3) => void, options: Omit<ParticleOptions, "position" | "velocity"> = {}): void {
    for (let i = 0; i < count; i++) {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
      place(i, position, velocity);
      this.add({ ...options, position, velocity });
    }
  }

  remove(id: BodyId): boolean {
    for (let k = 0; k < this.n; k++) {
      if (this.ids[k] === id) {
        this.ids[k] = this.ids[--this.n];
        return this.requireSim.world.removeBody(id);
      }
    }
    return false;
  }

  /** Removes all particles of the group. */
  clear(): void {
    const world = this.sim?.world;
    if (world) {
      // Owning every body in the store: drop them all at once instead of one by one
      if (this.n === world.bodies.count) world.bodies.clear();
      else for (let k = 0; k < this.n; k++) world.removeBody(this.ids[k]);
    }
    this.n = 0;
  }

  /** Calls `fn` with the dense body index of every particle (valid until bodies are added or removed). */
  forEachIndex(fn: (index: number) => void): void {
    const bodies = this.requireSim.world.bodies;
    for (let k = 0; k < this.n; k++) {
      const i = bodies.indexOf(this.ids[k]);
      if (i >= 0) fn(i);
    }
  }

  protected override onAttach(sim: Simulation): void {
    if (this.group < 0) this.group = sim.world.createGroup();
    const o = this.options;
    const render = o.render ?? ((o.radius ?? 0.01) > 0 ? "spheres" : "points");
    const bodies = sim.world.bodies;
    if (render === "spheres") {
      this.node = this.addNode(
        new SphereCloud(bodies, {
          color: o.color,
          palette: o.palette,
          colorIndex: o.colorIndex,
          depthCue: o.depthCue,
          shadeLevels: o.shadeLevels,
          minPixelRadius: o.minPixelRadius,
          layer: o.layer,
          group: this.group,
        }),
      );
    } else if (render === "points") {
      this.node = this.addNode(
        new PointCloud(bodies, {
          color: o.color,
          size: o.pointSize,
          depthCue: o.depthCue,
          shadeLevels: o.shadeLevels,
          layer: o.layer,
          group: this.group,
        }),
      );
    }
  }

  protected override onDetach(): void {
    this.clear();
    this.node = null;
  }

  override sync(): void {
    // When the group owns every body there is nothing to filter out (and the cloud skips the check)
    if (this.node) this.node.group = this.n === this.requireSim.world.bodies.count ? null : this.group;
  }
}
