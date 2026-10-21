import { PlaneCollider } from "../../physics/colliders.js";
import { Mesh } from "../../scene/mesh.js";
import { Layer, MeshNode } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";

export interface GroundOptions {
  name?: string;
  /** Height of the ground plane. Default 0. */
  y?: number;
  /** Edge length of the drawn square. Default 2. */
  size?: number;
  divisions?: number;
  /** Grid lines, or a solid plane of faces. Default "grid". */
  style?: "grid" | "plane";
  color?: string;
  opacity?: number;
  lineWidth?: number;
  /** A physics floor bodies rest on. Default true; false makes it decoration only. */
  collider?: boolean;
  restitution?: number;
  friction?: number;
}

/**
 * A horizontal floor: an infinite physics plane (optional) and a finite drawn grid or plane in the
 * background layer, so it never covers what stands on it. Shadows are cast onto it.
 */
export class Ground extends SimObject {
  readonly collider: PlaneCollider | null;
  readonly node: MeshNode;

  constructor(options: GroundOptions = {}) {
    super({ name: options.name ?? "ground" });
    const y = options.y ?? 0;
    this.transform.position.y = y;
    const size = options.size ?? 2;
    const divisions = options.divisions ?? 16;
    const mesh = options.style === "plane" ? Mesh.plane(size, size, divisions, divisions) : Mesh.grid(size, divisions);
    this.node = this.addNode(
      new MeshNode(mesh, {
        color: options.color ?? "#d618c6",
        opacity: options.opacity ?? 0.35,
        lineWidth: options.lineWidth,
      }),
    );
    this.node.layer = Layer.Background;
    this.node.receiveShadow = true;
    this.collider =
      options.collider === false
        ? null
        : this.addCollider(
            new PlaneCollider({ x: 0, y: 1, z: 0 }, y, { restitution: options.restitution, friction: options.friction }),
          );
  }

  override update(): void {
    // The physics plane follows the object when it is moved
    if (this.collider) this.collider.offset = this.transform.position.y;
  }
}
