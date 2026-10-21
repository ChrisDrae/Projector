import { AmbientLight, DirectionalLight, type Light } from "./light.js";
import type { CustomNode, LineSet, MeshNode, PointCloud, SphereCloud } from "./nodes.js";

export type SceneNode = MeshNode | SphereCloud | PointCloud | LineSet | CustomNode;

/** Linear fog: things fade toward `color` between `near` and `far`. */
export interface Fog {
  color: string;
  near: number;
  far: number;
  /**
   * What near and far measure. "depth" (default): view depth, so fog lies in planes facing the camera
   * and shifts at the edges of the screen as the view turns. "distance": distance from the camera, the
   * same in every direction (open landscapes).
   */
  mode?: "depth" | "distance";
}

/** Look of planar shadows (see MeshNode.receiveShadow / castShadow and the lights' castShadow). */
export interface ShadowStyle {
  color: string;
  opacity: number;
}

export interface SceneOptions {
  background?: string;
  fog?: Fog | null;
  shadow?: ShadowStyle;
  /** Intensity of the ambient light (scene.ambient). Default 0.3. */
  ambient?: number;
}

/** Flat list of renderable nodes plus lights. */
export class Scene {
  background: string;
  readonly nodes: SceneNode[] = [];
  /** Light reaching every surface evenly. It is not one of `lights`: replacing those keeps it. */
  ambient: AmbientLight = new AmbientLight();
  /** Every other light. Default: one white directional light. */
  lights: Light[] = [new DirectionalLight()];
  fog: Fog | null;
  shadow: ShadowStyle;

  constructor(options: SceneOptions = {}) {
    this.background = options.background ?? "#333131";
    this.fog = options.fog ?? null;
    this.shadow = options.shadow ?? { color: "#000000", opacity: 0.35 };
    if (options.ambient !== undefined) this.ambient.intensity = options.ambient;
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
