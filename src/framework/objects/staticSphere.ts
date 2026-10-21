import type { Vec3 } from "../../math/vec3.js";
import { SphereCollider } from "../../physics/colliders.js";
import type { MaterialOptions } from "../../scene/material.js";
import { Mesh } from "../../scene/mesh.js";
import { MeshNode } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";

export interface StaticSphereOptions {
  name?: string;
  center: Vec3;
  radius: number;
  material?: MaterialOptions;
  /** Drawn radius relative to the physics one; slightly smaller hides bodies resting on it. Default 0.97. */
  visualScale?: number;
  widthSegments?: number;
  heightSegments?: number;
  restitution?: number;
  friction?: number;
}

/** A fixed ball bodies bounce off or drape over. Moving the object's transform moves the collider too. */
export class StaticSphere extends SimObject {
  readonly collider: SphereCollider;
  readonly node: MeshNode;

  constructor(options: StaticSphereOptions) {
    super({ name: options.name ?? "sphere" });
    const t = this.transform;
    t.position.x = options.center.x;
    t.position.y = options.center.y;
    t.position.z = options.center.z;
    // The collider reads the transform's position, so they never disagree
    this.collider = this.addCollider(
      new SphereCollider(t.position, options.radius, { restitution: options.restitution, friction: options.friction }),
    );
    const r = options.radius * (options.visualScale ?? 0.97);
    this.node = this.addNode(
      new MeshNode(Mesh.sphere(r, options.widthSegments ?? 20, options.heightSegments ?? 14), {
        color: "#d618c6",
        ...options.material,
      }),
    );
  }
}
