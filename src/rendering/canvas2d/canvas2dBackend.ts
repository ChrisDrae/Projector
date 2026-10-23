import type { PerspectiveCamera } from "../../scene/camera.js";
import type { Scene } from "../../scene/scene.js";
import type { RenderBackend, RenderStats } from "../backend.js";
import { SoftwareEmitter } from "../software/emit.js";
import { Rasterizer } from "./rasterizer.js";
import { SpriteCache, defaultCanvasFactory, type CanvasFactory } from "./spriteCache.js";

export interface Canvas2DBackendOptions {
  /** Device pixels per CSS pixel. Defaults to window.devicePixelRatio (1 in a worker). */
  pixelRatio?: number;
  /**
   * Follow the canvas' CSS size with a ResizeObserver. Default true. An OffscreenCanvas has no CSS
   * size: it starts at width x height and follows setSize() calls (e.g. sizes posted by the page).
   */
  autoResize?: boolean;
  /** Initial size in CSS pixels when not auto-resizing. Defaults to the canvas attributes. */
  width?: number;
  height?: number;
  /** Where lit sphere sprites are rendered; defaults to OffscreenCanvas or canvas elements. */
  canvasFactory?: CanvasFactory;
  /** Grow opaque polygons by this many pixels to close hairline seams between them (see RenderQueue.seam). */
  seam?: number;
  /** Most primitives drawn as one path (see Rasterizer.maxBatch). */
  maxBatch?: number;
  /**
   * Debugging and benchmarks only: wait for the canvas to finish drawing every frame, so stats.ms
   * includes it (stats.finishMs). It reads a pixel back, which stalls the pipeline, and browsers may move
   * a canvas that is read back often off the GPU for good. Default false.
   */
  syncTiming?: boolean;
}

/** The 2D context of a canvas element, or of an OffscreenCanvas (in a worker, for example). */
export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function isCanvasElement(canvas: HTMLCanvasElement | OffscreenCanvas): canvas is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement;
}

/**
 * Renders a Scene onto a 2D canvas through the software pipeline, in a handful of batched draw calls.
 * The canvas can be an OffscreenCanvas, so a whole Simulation can run in a worker (see the README).
 */
export class Canvas2DBackend implements RenderBackend {
  readonly name: string = "canvas2d";
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly ctx: Canvas2DContext;
  readonly emitter: SoftwareEmitter = new SoftwareEmitter();
  readonly rasterizer: Rasterizer = new Rasterizer();
  /** Images of lit sphere sprites, null when the environment can't make canvases. */
  readonly sprites: SpriteCache | null;
  readonly stats: RenderStats = { primitives: 0, batches: 0, culled: 0, ms: 0 };
  /** Size in CSS pixels. */
  width: number = 0;
  height: number = 0;
  pixelRatio: number;
  /** See Canvas2DBackendOptions.syncTiming. */
  syncTiming: boolean;
  private observer: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: Canvas2DBackendOptions = {}) {
    const element = isCanvasElement(canvas) ? canvas : null;
    const ctx = element ? element.getContext("2d") : (canvas as OffscreenCanvas).getContext("2d");
    if (!ctx) throw new Error("Unable to get a 2D rendering context for the canvas.");
    this.canvas = canvas;
    this.ctx = ctx;
    this.pixelRatio = options.pixelRatio ?? (globalThis.devicePixelRatio || 1);
    this.syncTiming = options.syncTiming ?? false;
    this.emitter.queue.seam = options.seam ?? 0;
    if (options.maxBatch !== undefined) this.rasterizer.maxBatch = options.maxBatch;
    const factory = options.canvasFactory ?? defaultCanvasFactory();
    this.sprites = factory ? new SpriteCache(factory) : null;
    this.rasterizer.sprites = this.sprites;

    if (element && (options.autoResize ?? true)) {
      this.setSize(element.clientWidth || element.width, element.clientHeight || element.height);
      if (typeof ResizeObserver !== "undefined") {
        this.observer = new ResizeObserver(() => this.setSize(element.clientWidth, element.clientHeight));
        this.observer.observe(element);
      }
    } else {
      this.setSize(options.width ?? canvas.width, options.height ?? canvas.height);
    }
  }

  setSize(width: number, height: number, pixelRatio: number = this.pixelRatio): void {
    if (width <= 0 || height <= 0) return;
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    // Resizing clears the canvas and its state, so drawing happens in CSS pixels via a transform
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.rasterizer.pixelRatio = pixelRatio;
    this.rasterizer.reset();
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    const start = performance.now();
    camera.aspect = this.width / this.height;
    const queue = this.emitter.queue;
    this.emitter.emitScene(scene, camera, this.width, this.height);
    queue.sort();

    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.rasterizer.reset();
    this.sprites?.startFrame();

    this.stats.batches = this.rasterizer.draw(ctx, queue);
    this.stats.primitives = queue.count;
    this.stats.culled = this.emitter.culled;
    if (this.syncTiming) {
      const t = performance.now();
      ctx.getImageData(0, 0, 1, 1);
      this.stats.finishMs = performance.now() - t;
    }
    this.stats.ms = performance.now() - start;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
