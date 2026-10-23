import { Material, type MaterialOptions } from "../../scene/material.js";
import type { Mesh } from "../../scene/mesh.js";
import { MeshNode, type SortMode } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";

export interface MeshObjectOptions {
  name?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Default "face"; "object" suits convex meshes (their faces then never cut into other objects). */
  sortMode?: SortMode;
  layer?: number;
}

/** A visible mesh in the scene graph, without physics: props, markers, anything you move yourself. */
export class MeshObject extends SimObject {
  readonly node: MeshNode;

  constructor(mesh: Mesh, material: Material | MaterialOptions = {}, options: MeshObjectOptions = {}) {
    super({ name: options.name ?? "mesh" });
    this.node = this.addNode(new MeshNode(mesh, material instanceof Material ? material : new Material(material)));
    this.node.castShadow = options.castShadow ?? false;
    this.node.receiveShadow = options.receiveShadow ?? false;
    this.node.sortMode = options.sortMode ?? "face";
    if (options.layer !== undefined) this.node.layer = options.layer;
  }

  get material(): Material {
    return this.node.material;
  }

  get mesh(): Mesh {
    return this.node.mesh;
  }
}
