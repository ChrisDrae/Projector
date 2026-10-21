import { AmbientLight, DirectionalLight } from "./light.js";
import type { CustomNode, LineSet, MeshNode, PointCloud, SphereCloud } from "./nodes.js";

export type SceneNode = MeshNode | SphereCloud | PointCloud | LineSet | CustomNode;

export interface SceneOptions {
  background?: string;
}

/** Flat list of renderable nodes plus lights. */
export class Scene {
  background: string;
  readonly nodes: SceneNode[] = [];
  ambient: AmbientLight = new AmbientLight();
  lights: DirectionalLight[] = [new DirectionalLight()];

  constructor(options: SceneOptions = {}) {
    this.background = options.background ?? "#333131";
  }

  add<T extends SceneNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  remove(node: SceneNode): void {
    const i = this.nodes.indexOf(node);
    if (i >= 0) this.nodes.splice(i, 1);
  }
}
