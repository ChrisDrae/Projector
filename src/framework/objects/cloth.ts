import type { Vec3 } from "../../math/vec3.js";
import { DistanceConstraintSet } from "../../physics/constraints.js";
import type { BodyId } from "../../physics/types.js";
import type { MaterialOptions } from "../../scene/material.js";
import { Mesh } from "../../scene/mesh.js";
import { MeshNode } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";
import type { Simulation } from "../simulation.js";

export interface ClothOptions {
  name?: string;
  width: number;
  height: number;
  /** Particles along the width and the height. */
  columns: number;
  rows: number;
  /** Center of the top edge; the cloth hangs down from it in the xy plane. Default (0, 0, 0). */
  top?: Vec3;
  /** Mass per particle. Default 0.02. */
  mass?: number;
  /** Distance kept from colliders (particles don't collide with each other). Default 0.01. */
  radius?: number;
  /** Which particles hang still. Default: the two top corners. */
  pinned?: (column: number, row: number) => boolean;
  /** Diagonal links resisting shear. Default true. */
  shear?: boolean;
  /** Links over two particles resisting bending. Default true. */
  bending?: boolean;
  /** 0..1, see DistanceConstraintSet. Default 1. */
  stiffness?: number;
  material?: MaterialOptions;
  /** Collision group. Default: a new group. */
  group?: number;
}

/**
 * A sheet of particles held together by distance constraints and drawn as a flat-shaded, double-sided
 * mesh whose vertices follow the particles every frame.
 */
export class Cloth extends SimObject {
  readonly options: ClothOptions;
  readonly mesh: Mesh;
  readonly node: MeshNode;
  links: DistanceConstraintSet | null = null;
  group: number;
  /** Particle ids in mesh vertex order (row by row). */
  ids: BodyId[] = [];
  pins: BodyId[] = [];

  constructor(options: ClothOptions) {
    super({ name: options.name ?? "cloth" });
    this.options = options;
    this.group = options.group ?? -1;
    this.mesh = Mesh.plane(options.width, options.height, options.columns - 1, options.rows - 1);
    // Vertices are world positions copied from the particles: don't follow the object's transform
    this.node = this.addNode(new MeshNode(this.mesh, { color: "#e0a23a", side: "double", ...options.material }), false);
  }

  /** Lets the pinned particles fall. */
  release(): void {
    const world = this.requireSim.world;
    for (const id of this.pins) if (world.bodies.has(id)) world.setStatic(id, false);
  }

  /** Puts the cloth back to its initial hanging state. */
  reset(): void {
    const sim = this.requireSim;
    this.destroy(sim);
    this.build(sim);
  }

  protected override onAttach(sim: Simulation): void {
    if (this.group < 0) this.group = sim.world.createGroup();
    this.build(sim);
  }

  protected override onDetach(sim: Simulation): void {
    this.destroy(sim);
  }

  override sync(): void {
    const bodies = this.requireSim.world.bodies;
    const pos = bodies.pos;
    const out = this.mesh.positions;
    for (let k = 0; k < this.ids.length; k++) {
      const o = bodies.indexOf(this.ids[k]) * 3;
      if (o < 0) continue;
      out[k * 3] = pos[o];
      out[k * 3 + 1] = pos[o + 1];
      out[k * 3 + 2] = pos[o + 2];
    }
    this.mesh.markDirty();
  }

  private build(sim: Simulation): void {
    const o = this.options;
    const world = sim.world;
    const cols = o.columns;
    const rows = o.rows;
    const top = o.top ?? { x: 0, y: 0, z: 0 };
    const dx = o.width / (cols - 1);
    const dy = o.height / (rows - 1);
    const pinned = o.pinned ?? ((i: number, j: number) => j === 0 && (i === 0 || i === cols - 1));
    this.links = this.addConstraint(new DistanceConstraintSet(world.bodies, { stiffness: o.stiffness }));
    this.ids = [];
    this.pins = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const isPinned = pinned(i, j);
        const id = world.addBody({
          position: { x: top.x - o.width / 2 + i * dx, y: top.y - j * dy, z: top.z },
          mass: o.mass ?? 0.02,
          radius: o.radius ?? 0.01,
          collides: false,
          isStatic: isPinned,
          group: this.group,
        });
        this.ids.push(id);
        if (isPinned) this.pins.push(id);
      }
    }
    const links = this.links;
    const at = (i: number, j: number): BodyId => this.ids[j * cols + i];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (i + 1 < cols) links.add(at(i, j), at(i + 1, j));
        if (j + 1 < rows) links.add(at(i, j), at(i, j + 1));
        if (o.shear !== false && i + 1 < cols && j + 1 < rows) {
          links.add(at(i, j), at(i + 1, j + 1));
          links.add(at(i + 1, j), at(i, j + 1));
        }
        if (o.bending !== false) {
          if (i + 2 < cols) links.add(at(i, j), at(i + 2, j));
          if (j + 2 < rows) links.add(at(i, j), at(i, j + 2));
        }
      }
    }
  }

  private destroy(sim: Simulation): void {
    if (this.links) this.removeResource(this.links);
    this.links = null;
    const world = sim.world;
    if (this.ids.length === world.bodies.count) world.bodies.clear();
    else for (const id of this.ids) world.removeBody(id);
    this.ids = [];
    this.pins = [];
  }
}
