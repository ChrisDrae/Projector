import type { Vec3 } from "../../math/vec3.js";
import { BoxContainer, type BoxContainerOptions } from "../../physics/colliders.js";
import type { MaterialOptions } from "../../scene/material.js";
import { Mesh } from "../../scene/mesh.js";
import { MeshNode } from "../../scene/nodes.js";
import type { Random } from "../../utility/random.js";
import { SimObject } from "../simObject.js";

export interface ContainerOptions extends BoxContainerOptions {
  name?: string;
  /** Look of the box. Default: a magenta wireframe. */
  material?: MaterialOptions;
}

const local: Vec3 = { x: 0, y: 0, z: 0 };
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * A box that keeps bodies inside, with its wireframe. It is kinematic: set linearVelocity and
 * angularVelocity to move and spin it, and its walls throw the bodies around. The object's transform is
 * the collider's, so the drawn box and the physics box are always the same.
 */
export class Container extends SimObject {
  readonly collider: BoxContainer;
  readonly node: MeshNode;

  constructor(options: ContainerOptions) {
    const collider = new BoxContainer(options);
    super({ name: options.name ?? "container", transform: collider.transform });
    this.collider = this.addCollider(collider);
    const h = collider.halfExtents;
    this.node = this.addNode(
      new MeshNode(Mesh.box(h.x * 2, h.y * 2, h.z * 2), { color: "#d618c6", wireframe: true, ...options.material }),
    );
  }

  get linearVelocity(): Vec3 {
    return this.collider.linearVelocity;
  }

  get angularVelocity(): Vec3 {
    return this.collider.angularVelocity;
  }

  get halfExtents(): Vec3 {
    return this.collider.halfExtents;
  }

  /** A uniformly random point inside, at least `margin` from the walls (e.g. a particle radius). */
  randomPoint(rnd: Random, out: Vec3, margin: number = 0): Vec3 {
    const h = this.collider.halfExtents;
    rnd.inBox(local, ORIGIN, { x: h.x - margin, y: h.y - margin, z: h.z - margin });
    return this.transform.toWorld(out, local);
  }

  /** Moves the box to a pose instantly (no velocity transfer to the bodies inside). */
  setPose(position: Vec3, rotation?: ArrayLike<number>): void {
    const t = this.transform;
    t.position.x = position.x;
    t.position.y = position.y;
    t.position.z = position.z;
    if (rotation) for (let k = 0; k < 4; k++) t.rotation[k] = rotation[k];
    this.collider.cacheAxes();
  }
}
