import type { Vec3 } from "../../math/vec3.js";
import type { RigidBodyId, RigidBodyOptions, RigidBodyStore } from "../../physics/rigid/rigidStore.js";
import { Shapes, type Shape } from "../../physics/rigid/shapes.js";
import { Material, type MaterialOptions } from "../../scene/material.js";
import { Mesh } from "../../scene/mesh.js";
import { MeshNode } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";
import type { Simulation } from "../simulation.js";

export interface RigidObjectOptions extends Omit<RigidBodyOptions, "shape" | "position"> {
  name?: string;
  /** Default (0, 0, 0). */
  position?: Vec3;
  material?: Material | MaterialOptions;
  /** What is drawn; defaults to a mesh matching the shape. */
  mesh?: Mesh;
  /** Default true. */
  castShadow?: boolean;
}

/**
 * A rigid body with its mesh: the object's transform follows the body every frame (sync), and the body
 * is created and destroyed with the object. Its pose is in world space, so add it to the simulation's
 * root (or under objects that don't move).
 */
export class RigidObject extends SimObject {
  readonly shape: Shape;
  readonly node: MeshNode;
  /** The body's id in world.rigid, or -1 while the object is not in a simulation. */
  id: RigidBodyId = -1;
  private readonly options: RigidObjectOptions;

  constructor(shape: Shape, options: RigidObjectOptions = {}) {
    super({ name: options.name ?? shape.type });
    this.shape = shape;
    this.options = options;
    const p = options.position;
    if (p) {
      this.transform.position.x = p.x;
      this.transform.position.y = p.y;
      this.transform.position.z = p.z;
    }
    if (options.rotation) for (let k = 0; k < 4; k++) this.transform.rotation[k] = options.rotation[k];
    const material = options.material instanceof Material ? options.material : new Material({ ...defaultLook(shape), ...options.material });
    this.node = this.addNode(new MeshNode(options.mesh ?? meshFor(shape), material));
    // Convex shapes: sort by object so neighbors in a stack never cut into each other
    this.node.sortMode = "object";
    this.node.castShadow = options.castShadow ?? true;
  }

  get material(): Material {
    return this.node.material;
  }

  /** The world's rigid body store (only while in a simulation). */
  private get store(): RigidBodyStore {
    return this.requireSim.world.rigid;
  }

  getVelocity(target: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    return this.store.getVelocity(this.id, target);
  }

  setVelocity(v: Vec3): void {
    this.store.setVelocity(this.id, v);
  }

  setAngularVelocity(w: Vec3): void {
    this.store.setAngularVelocity(this.id, w);
  }

  applyImpulse(impulse: Vec3, point?: Vec3): void {
    this.store.applyImpulse(this.id, impulse, point);
  }

  applyForce(force: Vec3, point?: Vec3): void {
    this.store.applyForce(this.id, force, point);
  }

  /** Teleports the body (and wakes it). */
  setPose(position: Vec3, rotation?: ArrayLike<number>): void {
    this.store.setPosition(this.id, position);
    if (rotation) this.store.setRotation(this.id, rotation);
    this.sync();
  }

  get sleeping(): boolean {
    return this.id >= 0 && this.store.isSleeping(this.id);
  }

  protected override onAttach(sim: Simulation): void {
    this.id = sim.world.addRigidBody({
      ...this.options,
      shape: this.shape,
      position: this.transform.position,
      rotation: this.transform.rotation,
    });
  }

  protected override onDetach(sim: Simulation): void {
    sim.world.removeRigidBody(this.id);
    this.id = -1;
  }

  override sync(): void {
    if (this.id < 0) return;
    const s = this.store;
    const i = s.indexOf(this.id);
    if (i < 0) return;
    const t = this.transform;
    t.position.x = s.pos[i * 3];
    t.position.y = s.pos[i * 3 + 1];
    t.position.z = s.pos[i * 3 + 2];
    for (let k = 0; k < 4; k++) t.rotation[k] = s.quat[i * 4 + k];
  }
}

/** A box of full size sx x sy x sz. */
export class RigidBox extends RigidObject {
  constructor(size: number | Vec3, options: RigidObjectOptions = {}) {
    const s = typeof size === "number" ? { x: size, y: size, z: size } : size;
    super(Shapes.box(s.x, s.y, s.z), options);
  }
}

export class RigidSphere extends RigidObject {
  constructor(radius: number, options: RigidObjectOptions = {}) {
    super(Shapes.sphere(radius), options);
  }
}

/** A capsule along its local y axis: a segment of 2 * halfHeight swept by radius. */
export class RigidCapsule extends RigidObject {
  constructor(radius: number, halfHeight: number, options: RigidObjectOptions = {}) {
    super(Shapes.capsule(radius, halfHeight), options);
  }
}

/** A mesh matching a shape. */
export function meshFor(shape: Shape): Mesh {
  switch (shape.type) {
    case "sphere":
      // Smooth shading hides the facets, so a light mesh is enough
      return Mesh.icosphere(shape.radius, 1);
    case "box": {
      const h = shape.halfExtents;
      return Mesh.box(h.x * 2, h.y * 2, h.z * 2);
    }
    case "capsule":
      return Mesh.capsule(shape.radius, shape.halfHeight, 12, 3);
  }
}

/** Boxes look best flat; round shapes smooth with a little highlight. */
function defaultLook(shape: Shape): MaterialOptions {
  return shape.type === "box" ? { color: "#e0a23a", specular: 0.15 } : { color: "#4fb0e8", shading: "smooth", specular: 0.35 };
}
