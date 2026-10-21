export type Side = "front" | "double";

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
  /** Shade faces by the scene lights. */
  flatShading?: boolean;
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
  flatShading: boolean;
  side: Side;
  opacity: number;

  constructor(options: MaterialOptions = {}) {
    this.color = options.color ?? "#d618c6";
    this.edgeColor = options.edgeColor ?? null;
    this.wireframe = options.wireframe ?? false;
    this.edges = options.edges ?? false;
    this.lineWidth = options.lineWidth ?? 1;
    this.flatShading = options.flatShading ?? true;
    this.side = options.side ?? "front";
    this.opacity = options.opacity ?? 1;
  }
}
