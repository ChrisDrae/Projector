import type { PerspectiveCamera } from "../scene/camera.js";
import type { Scene } from "../scene/scene.js";

export interface RenderStats {
  /** Primitives submitted this frame (polygons, lines, circles, points). */
  primitives: number;
  /** Draw batches: each is one path with a single fill/stroke. */
  batches: number;
  /** Faces or objects skipped (back faces, behind the camera, off screen). */
  culled: number;
  /** Time spent in render(), in milliseconds. */
  ms: number;
}

/**
 * A renderer for a Scene seen through a camera. Backends consume the scene itself (not screen-space
 * primitives), so a GPU backend can upload mesh and physics buffers directly.
 */
export interface RenderBackend {
  readonly name: string;
  readonly stats: RenderStats;
  setSize(width: number, height: number, pixelRatio?: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}
