import type { Mat4 } from "../math/mat4.js";
import { Transform } from "../math/transform.js";
import type { EmitContext } from "../rendering/software/emit.js";
import { Material, type MaterialOptions } from "./material.js";
import type { Mesh } from "./mesh.js";

/**
 * Render layers are drawn in order. Only the World layer is depth sorted (painter's algorithm);
 * the others are grouped by style for the fewest draw calls. Shadow holds projected shadows: above
 * the floor, below everything standing on it. Layers are numbers 0-7, so custom ones can sit between.
 */
export const Layer = { Background: 0, Shadow: 1, World: 2, Overlay: 3 } as const;

/**
 * How faces are ordered in the depth-sorted layer. "face" sorts every face by its own center (right for
 * open or concave meshes). "object" gives all faces the depth of the node's origin, which keeps convex
 * objects such as boxes in a stack from cutting into each other.
 */
export type SortMode = "face" | "object";

export class MeshNode {
  readonly kind: "mesh" = "mesh";
  mesh: Mesh;
  material: Material;
  /** Can be shared with a physics collider (e.g. BoxContainer.transform). */
  transform: Transform;
  /** World matrix of a parent (scene graph); the node's transform is then relative to it. */
  parentMatrix: Mat4 | null = null;
  sortMode: SortMode = "face";
  castShadow: boolean = false;
  receiveShadow: boolean = false;
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
  /** Group per sphere, for clouds that draw only one group. */
  readonly group?: ArrayLike<number>;
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
  /** Draw only the spheres of this group (needs source.group). Default: all. */
  group?: number | null;
  /** Cast planar shadows (an ellipse per sphere) onto shadow receivers. */
  castShadow?: boolean;
  /** See SphereShading. Default "flat". */
  shading?: SphereShading;
  /** Below this on-screen radius (CSS pixels) "sprite" spheres are drawn as "lit" circles. Default 2.5. */
  spriteMinRadius?: number;
  /** Highlight strength (0..1) and tightness of "sprite" spheres. Defaults 0.3 and 24. */
  specular?: number;
  shininess?: number;
}

/**
 * How spheres are colored. "flat": their color, faded with depth (depthCue). "lit": one color per sphere
 * from the scene lights and fog. "sprite": a shaded ball image per sphere with its own light and shadow
 * side and a highlight; small ones fall back to "lit". Lit and sprite spheres ignore depthCue.
 */
export type SphereShading = "flat" | "lit" | "sprite";

/** Many spheres drawn as screen-space circles, sized by perspective. */
export class SphereCloud {
  readonly kind: "spheres" = "spheres";
  source: SphereSource;
  palette: string[];
  colorIndex: ((i: number) => number) | null;
  depthCue: number;
  shadeLevels: number;
  minPixelRadius: number;
  /** Draw only the spheres of this group; null draws all. */
  group: number | null;
  castShadow: boolean;
  shading: SphereShading;
  spriteMinRadius: number;
  specular: number;
  shininess: number;
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
    this.group = options.group ?? null;
    this.castShadow = options.castShadow ?? false;
    this.shading = options.shading ?? "flat";
    this.spriteMinRadius = options.spriteMinRadius ?? 2.5;
    this.specular = options.specular ?? 0.3;
    this.shininess = options.shininess ?? 24;
  }
}

export interface PointSource {
  readonly count: number;
  readonly pos: ArrayLike<number>;
  readonly group?: ArrayLike<number>;
}

export interface PointCloudOptions {
  color?: string;
  /** Square size in CSS pixels. */
  size?: number;
  depthCue?: number;
  shadeLevels?: number;
  layer?: number;
  /** Draw only the points of this group (needs source.group). Default: all. */
  group?: number | null;
}

/** Fixed-size screen-space squares, e.g. for massless particles. */
export class PointCloud {
  readonly kind: "points" = "points";
  source: PointSource;
  color: string;
  size: number;
  depthCue: number;
  shadeLevels: number;
  group: number | null;
  visible: boolean = true;
  layer: number;

  constructor(source: PointSource, options: PointCloudOptions = {}) {
    this.source = source;
    this.color = options.color ?? "#f1eeee";
    this.size = options.size ?? 2;
    this.depthCue = options.depthCue ?? 0.5;
    this.shadeLevels = options.shadeLevels ?? 8;
    this.layer = options.layer ?? Layer.World;
    this.group = options.group ?? null;
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

  /** Grows the buffer (keeping its segments) so it holds at least `n` segments. */
  ensureCapacity(n: number): void {
    if (n <= this.capacity) return;
    const next = new Float32Array(Math.max(n, this.capacity * 2) * 6);
    next.set(this.positions);
    this.positions = next;
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

/**
 * A node that draws itself: the extension point for new kinds of 3D objects. `emit` runs once per frame
 * and submits primitives through the context (meshes, 3D polygons, lines and circles that are
 * transformed, clipped, projected and batched like the built-in nodes).
 */
export interface CustomNode {
  readonly kind: "custom";
  visible: boolean;
  layer: number;
  emit(ctx: EmitContext): void;
}
