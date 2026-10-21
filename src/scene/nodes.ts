import { Transform } from "../math/transform.js";
import { Material, type MaterialOptions } from "./material.js";
import type { Mesh } from "./mesh.js";

/**
 * Render layers are drawn in order. Only the World layer is depth sorted (painter's algorithm);
 * the others are grouped by style for the fewest draw calls.
 */
export const Layer = { Background: 0, World: 1, Overlay: 2 } as const;

export class MeshNode {
  readonly kind: "mesh" = "mesh";
  mesh: Mesh;
  material: Material;
  /** Can be shared with a physics collider (e.g. BoxContainer.transform). */
  transform: Transform;
  visible: boolean = true;
  layer: number = Layer.World;

  constructor(mesh: Mesh, material: Material | MaterialOptions = {}, transform: Transform = new Transform()) {
    this.mesh = mesh;
    this.material = material instanceof Material ? material : new Material(material);
    this.transform = transform;
  }
}

/** Anything with packed xyz positions and radii, such as the physics BodyStore (read without copying). */
export interface SphereSource {
  readonly count: number;
  readonly pos: ArrayLike<number>;
  readonly radius: ArrayLike<number>;
}

export interface SphereCloudOptions {
  color?: string;
  /** Several colors, picked per sphere by `colorIndex`. */
  palette?: string[];
  colorIndex?: ((i: number) => number) | null;
  /** 0..1: how far the farthest spheres fade toward the background color. */
  depthCue?: number;
  /** Number of quantized depth-cue shades (fewer shades = fewer draw calls). */
  shadeLevels?: number;
  minPixelRadius?: number;
  layer?: number;
}

/** Many spheres drawn as screen-space circles, sized by perspective. */
export class SphereCloud {
  readonly kind: "spheres" = "spheres";
  source: SphereSource;
  palette: string[];
  colorIndex: ((i: number) => number) | null;
  depthCue: number;
  shadeLevels: number;
  minPixelRadius: number;
  visible: boolean = true;
  layer: number;

  constructor(source: SphereSource, options: SphereCloudOptions = {}) {
    this.source = source;
    this.palette = options.palette ?? [options.color ?? "rgb(160, 212, 91)"];
    this.colorIndex = options.colorIndex ?? null;
    this.depthCue = options.depthCue ?? 0.45;
    this.shadeLevels = options.shadeLevels ?? 16;
    this.minPixelRadius = options.minPixelRadius ?? 0.6;
    this.layer = options.layer ?? Layer.World;
  }
}

export interface PointSource {
  readonly count: number;
  readonly pos: ArrayLike<number>;
}

export interface PointCloudOptions {
  color?: string;
  /** Square size in CSS pixels. */
  size?: number;
  depthCue?: number;
  shadeLevels?: number;
  layer?: number;
}

/** Fixed-size screen-space squares, e.g. for massless particles. */
export class PointCloud {
  readonly kind: "points" = "points";
  source: PointSource;
  color: string;
  size: number;
  depthCue: number;
  shadeLevels: number;
  visible: boolean = true;
  layer: number;

  constructor(source: PointSource, options: PointCloudOptions = {}) {
    this.source = source;
    this.color = options.color ?? "#f1eeee";
    this.size = options.size ?? 2;
    this.depthCue = options.depthCue ?? 0.5;
    this.shadeLevels = options.shadeLevels ?? 8;
    this.layer = options.layer ?? Layer.World;
  }
}

export interface LineSetOptions {
  color?: string;
  width?: number;
  opacity?: number;
  layer?: number;
}

/** Independent world-space segments in a typed array, rewritten freely each frame (trails, vectors, debug). */
export class LineSet {
  readonly kind: "lines" = "lines";
  /** Six floats per segment: ax, ay, az, bx, by, bz. */
  positions: Float32Array;
  count: number = 0;
  color: string;
  width: number;
  opacity: number;
  visible: boolean = true;
  layer: number;

  constructor(capacity: number, options: LineSetOptions = {}) {
    this.positions = new Float32Array(capacity * 6);
    this.color = options.color ?? "#f1eeee";
    this.width = options.width ?? 1;
    this.opacity = options.opacity ?? 1;
    this.layer = options.layer ?? Layer.World;
  }

  get capacity(): number {
    return this.positions.length / 6;
  }

  setSegment(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const o = i * 6;
    const p = this.positions;
    p[o] = ax;
    p[o + 1] = ay;
    p[o + 2] = az;
    p[o + 3] = bx;
    p[o + 4] = by;
    p[o + 5] = bz;
  }
}
