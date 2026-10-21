export type Side = "front" | "double";

/**
 * "flat": one color per face from the scene lights. "smooth": colors per vertex, blended across the face
 * (Gouraud). "unlit": the plain material color.
 */
export type Shading = "flat" | "smooth" | "unlit";

export interface MaterialOptions {
  /** Fill color (any CSS color: hex, rgb(), hsl()). */
  color?: string;
  /** Outline color for `edges`; defaults to a darker shade of `color`. */
  edgeColor?: string | null;
  /** Draw only the edges, no faces. */
  wireframe?: boolean;
  /** Outline the faces. */
  edges?: boolean;
  lineWidth?: number;
  shading?: Shading;
  /** Shorthand for shading: true is "flat", false "unlit". */
  flatShading?: boolean;
  /** Color the surface gives off by itself, unaffected by lights (and lighting nothing else). */
  emissive?: string | null;
  /** 0..1: strength of the highlight reflecting the lights (Blinn-Phong). Default 0. */
  specular?: number;
  /** Highlight tightness: higher is smaller and sharper. Default 32. */
  shininess?: number;
  /** "front" culls faces pointing away from the camera; "double" draws both sides. */
  side?: Side;
  opacity?: number;
}

export class Material {
  color: string;
  edgeColor: string | null;
  wireframe: boolean;
  edges: boolean;
  lineWidth: number;
  shading: Shading;
  emissive: string | null;
  specular: number;
  shininess: number;
  side: Side;
  opacity: number;

  constructor(options: MaterialOptions = {}) {
    this.color = options.color ?? "#d618c6";
    this.edgeColor = options.edgeColor ?? null;
    this.wireframe = options.wireframe ?? false;
    this.edges = options.edges ?? false;
    this.lineWidth = options.lineWidth ?? 1;
    this.shading = options.shading ?? (options.flatShading === false ? "unlit" : "flat");
    this.emissive = options.emissive ?? null;
    this.specular = options.specular ?? 0;
    this.shininess = options.shininess ?? 32;
    this.side = options.side ?? "front";
    this.opacity = options.opacity ?? 1;
  }

  /** Whether the scene lights shade this material ("flat" or "smooth"). */
  get flatShading(): boolean {
    return this.shading !== "unlit";
  }

  set flatShading(value: boolean) {
    this.shading = value ? "flat" : "unlit";
  }
}
