import { AmbientLight, DirectionalLight, type Light } from "./light.js";
import type { CustomNode, LineSet, MeshNode, PointCloud, SphereCloud } from "./nodes.js";

export type SceneNode = MeshNode | SphereCloud | PointCloud | LineSet | CustomNode;

/** Linear fog: things fade toward `color` between view depths `near` and `far`. */
export interface Fog {
  color: string;
  near: number;
  far: number;
}

export interface SceneOptions {
  background?: string;
  fog?: Fog | null;
}

/** Flat list of renderable nodes plus lights. */
export class Scene {
  background: string;
  readonly nodes: SceneNode[] = [];
  ambient: AmbientLight = new AmbientLight();
  lights: Light[] = [new DirectionalLight()];
  fog: Fog | null;

  constructor(options: SceneOptions = {}) {
    this.background = options.background ?? "#333131";
    this.fog = options.fog ?? null;
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
