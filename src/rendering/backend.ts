import type { PerspectiveCamera } from "../scene/camera.js";
import type { Scene } from "../scene/scene.js";

export interface RenderStats {
  /** Primitives submitted this frame (polygons, lines, circles, points). */
  primitives: number;
  /** Draw batches: each is one path with a single fill/stroke. */
  batches: number;
  /** Faces or objects skipped (back faces, behind the camera, outside the view). */
  culled: number;
  /**
   * Milliseconds spent in render(). For a canvas this is the CPU work (emit, sort, canvas calls): the
   * browser fills the pixels afterwards, often on the GPU, and that isn't included unless the backend
   * waits for it (see `finishMs`). The frame rate is the measure of everything.
   */
  ms: number;
  /** Milliseconds spent waiting for the drawing to finish, included in `ms`; only when timing is synced. */
  finishMs?: number;
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
