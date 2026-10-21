import * as mat4 from "../math/mat4.js";
import type { Mat4 } from "../math/mat4.js";
import { Transform } from "../math/transform.js";
import type { Collider, Constraint, ForceGenerator } from "../physics/types.js";
import type { Vec3 } from "../math/vec3.js";
import type { Light } from "../scene/light.js";
import type { SceneNode } from "../scene/scene.js";
import type { Simulation } from "./simulation.js";

type Resource =
  | { kind: "node"; node: SceneNode; persistent: boolean }
  | { kind: "collider"; collider: Collider; persistent: boolean }
  | { kind: "force"; force: ForceGenerator; persistent: boolean }
  | { kind: "constraint"; constraint: Constraint; persistent: boolean }
  | { kind: "light"; light: Light; persistent: boolean; local: Vec3 | null; localDir: Vec3 | null };

export interface SimObjectOptions {
  name?: string;
  /** Use an existing transform, e.g. a collider's, so the object and the physics share one pose. */
  transform?: Transform;
}

/**
 * Base class of everything placed in a Simulation. An object has a transform relative to its parent,
 * children, and resources it owns: scene nodes, colliders, forces, constraints and lights. Owned
 * resources are registered with the world and scene while the object is in a simulation and removed
 * with it, so removing an object cleans up everything it added.
 *
 * Subclasses override the hooks: onAttach/onDetach to create and destroy bodies, update (every frame,
 * before physics), fixedUpdate (every fixed physics step) and sync (every frame after physics, to copy
 * physics state into transforms and meshes). Hot data stays in the world's typed arrays; objects are
 * handles to it, never one object per particle.
 */
export class SimObject {
  name: string;
  /** Pose relative to the parent. */
  readonly transform: Transform;
  /** Parent world matrix times the local transform, updated every frame after sync(). */
  readonly worldMatrix: Mat4 = mat4.create();
  parent: SimObject | null = null;
  readonly children: SimObject[] = [];
  /** Hides the object's nodes and those of its children. */
  visible: boolean = true;
  private simulation: Simulation | null = null;
  private readonly resources: Resource[] = [];
  private shown: boolean = true;

  constructor(options: SimObjectOptions = {}) {
    this.name = options.name ?? this.constructor.name;
    this.transform = options.transform ?? new Transform();
  }

  /** The simulation this object is in, or null. */
  get sim(): Simulation | null {
    return this.simulation;
  }

  /** The simulation; throws when the object has not been added to one yet. */
  protected get requireSim(): Simulation {
    if (!this.simulation) throw new Error(`${this.name} must be added to a Simulation first.`);
    return this.simulation;
  }

  addChild<T extends SimObject>(child: T): T {
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    if (this.simulation) child.attach(this.simulation);
    return child;
  }

  removeChild(child: SimObject): void {
    const i = this.children.indexOf(child);
    if (i < 0) return;
    if (child.simulation) child.detach();
    this.children.splice(i, 1);
    child.parent = null;
  }

  /** Adds a scene node. Meshes follow the object (drawn relative to its world matrix) unless follow is false. */
  addNode<T extends SceneNode>(node: T, follow: boolean = true): T {
    if (follow && node.kind === "mesh" && node.parentMatrix === null) node.parentMatrix = this.worldMatrix;
    this.own({ kind: "node", node, persistent: this.simulation === null });
    return node;
  }

  addCollider<T extends Collider>(collider: T): T {
    this.own({ kind: "collider", collider, persistent: this.simulation === null });
    return collider;
  }

  addForce<T extends ForceGenerator>(force: T): T {
    this.own({ kind: "force", force, persistent: this.simulation === null });
    return force;
  }

  addConstraint<T extends Constraint>(constraint: T): T {
    this.own({ kind: "constraint", constraint, persistent: this.simulation === null });
    return constraint;
  }

  /**
   * Adds a light. Point and spot lights follow the object (unless follow is false): their position, and
   * a spot light's direction, are then relative to the object and recomputed every frame.
   */
  addLight<T extends Light>(light: T, follow: boolean = true): T {
    const positional = follow && (light.kind === "point" || light.kind === "spot");
    this.own({
      kind: "light",
      light,
      persistent: this.simulation === null,
      local: positional ? { ...light.position } : null,
      localDir: positional && light.kind === "spot" ? { ...light.direction } : null,
    });
    return light;
  }

  /** Removes an owned resource added with one of the add methods. */
  removeResource(resource: SceneNode | Collider | ForceGenerator | Constraint | Light): void {
    const i = this.resources.findIndex((r) => resourceOf(r) === resource);
    if (i < 0) return;
    if (this.simulation) this.unregister(this.resources[i], this.simulation);
    this.resources.splice(i, 1);
  }

  /** Called when the object enters a simulation, after its constructor-time resources were registered. */
  protected onAttach(_sim: Simulation): void {}

  /** Called before the object leaves a simulation; resources are unregistered afterwards. */
  protected onDetach(_sim: Simulation): void {}

  /** Every frame, before physics. */
  update(_dt: number): void {}

  /** Every fixed physics step, before forces are applied. */
  fixedUpdate(_dt: number): void {}

  /** Every frame after physics, before world matrices are computed: copy physics state into transforms here. */
  sync(): void {}

  /** Called by Simulation and parents. */
  attach(sim: Simulation): void {
    this.simulation = sim;
    for (const r of this.resources) this.register(r, sim);
    this.onAttach(sim);
    for (const child of this.children) child.attach(sim);
  }

  /** Called by Simulation and parents. */
  detach(): void {
    const sim = this.simulation;
    if (!sim) return;
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i].detach();
    this.onDetach(sim);
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const r = this.resources[i];
      this.unregister(r, sim);
      // Resources created while attached (in onAttach) are created again on the next attach
      if (!r.persistent) this.resources.splice(i, 1);
    }
    this.simulation = null;
  }

  updateTree(dt: number): void {
    this.update(dt);
    for (let i = 0; i < this.children.length; i++) this.children[i].updateTree(dt);
  }

  fixedUpdateTree(dt: number): void {
    this.fixedUpdate(dt);
    for (let i = 0; i < this.children.length; i++) this.children[i].fixedUpdateTree(dt);
  }

  syncTree(parentMatrix: Mat4 | null, parentShown: boolean): void {
    this.sync();
    const local = this.transform.updateMatrix();
    if (parentMatrix) mat4.multiply(this.worldMatrix, parentMatrix, local);
    else mat4.copy(this.worldMatrix, local);
    const shown = parentShown && this.visible;
    if (shown !== this.shown) {
      this.shown = shown;
      for (const r of this.resources) if (r.kind === "node") r.node.visible = shown;
    }
    for (const r of this.resources) {
      if (r.kind === "light" && r.local) this.placeLight(r.light, r.local, r.localDir);
    }
    for (let i = 0; i < this.children.length; i++) this.children[i].syncTree(this.worldMatrix, shown);
  }

  private placeLight(light: Light, local: Vec3, localDir: Vec3 | null): void {
    if (light.kind !== "point" && light.kind !== "spot") return;
    const m = this.worldMatrix;
    const p = light.position;
    p.x = m[0] * local.x + m[4] * local.y + m[8] * local.z + m[12];
    p.y = m[1] * local.x + m[5] * local.y + m[9] * local.z + m[13];
    p.z = m[2] * local.x + m[6] * local.y + m[10] * local.z + m[14];
    if (localDir && light.kind === "spot") {
      const d = light.direction;
      d.x = m[0] * localDir.x + m[4] * localDir.y + m[8] * localDir.z;
      d.y = m[1] * localDir.x + m[5] * localDir.y + m[9] * localDir.z;
      d.z = m[2] * localDir.x + m[6] * localDir.y + m[10] * localDir.z;
    }
  }

  private own(r: Resource): void {
    this.resources.push(r);
    if (r.kind === "node" && !this.shown) r.node.visible = false;
    if (this.simulation) this.register(r, this.simulation);
  }

  private register(r: Resource, sim: Simulation): void {
    switch (r.kind) {
      case "node":
        sim.scene.add(r.node);
        break;
      case "collider":
        sim.world.addCollider(r.collider);
        break;
      case "force":
        sim.world.addForce(r.force);
        break;
      case "constraint":
        sim.world.addConstraint(r.constraint);
        break;
      case "light":
        sim.scene.lights.push(r.light);
        break;
    }
  }

  private unregister(r: Resource, sim: Simulation): void {
    switch (r.kind) {
      case "node":
        sim.scene.remove(r.node);
        break;
      case "collider":
        sim.world.removeCollider(r.collider);
        break;
      case "force":
        sim.world.removeForce(r.force);
        break;
      case "constraint":
        sim.world.removeConstraint(r.constraint);
        break;
      case "light": {
        const i = sim.scene.lights.indexOf(r.light);
        if (i >= 0) sim.scene.lights.splice(i, 1);
        break;
      }
    }
  }
}

function resourceOf(r: Resource): unknown {
  switch (r.kind) {
    case "node":
      return r.node;
    case "collider":
      return r.collider;
    case "force":
      return r.force;
    case "constraint":
      return r.constraint;
    case "light":
      return r.light;
  }
}
