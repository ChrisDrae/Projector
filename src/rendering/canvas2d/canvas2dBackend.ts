import type { PerspectiveCamera } from "../../scene/camera.js";
import type { Scene } from "../../scene/scene.js";
import type { RenderBackend, RenderStats } from "../backend.js";
import { SoftwareEmitter } from "../software/emit.js";
import { Rasterizer } from "./rasterizer.js";

export interface Canvas2DBackendOptions {
  /** Device pixels per CSS pixel. Defaults to window.devicePixelRatio. */
  pixelRatio?: number;
  /** Follow the canvas' CSS size with a ResizeObserver. Default true. */
  autoResize?: boolean;
  /** Initial size in CSS pixels when not auto-resizing. Defaults to the canvas attributes. */
  width?: number;
  height?: number;
}

/** Renders a Scene onto a 2D canvas through the software pipeline, in a handful of batched draw calls. */
export class Canvas2DBackend implements RenderBackend {
  readonly name: string = "canvas2d";
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly emitter: SoftwareEmitter = new SoftwareEmitter();
  readonly rasterizer: Rasterizer = new Rasterizer();
  readonly stats: RenderStats = { primitives: 0, batches: 0, culled: 0, ms: 0 };
  /** Size in CSS pixels. */
  width: number = 0;
  height: number = 0;
  pixelRatio: number;
  private observer: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, options: Canvas2DBackendOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to get a 2D rendering context for the canvas.");
    this.canvas = canvas;
    this.ctx = ctx;
    this.pixelRatio = options.pixelRatio ?? (globalThis.devicePixelRatio || 1);

    if (options.autoResize ?? true) {
      this.setSize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
      if (typeof ResizeObserver !== "undefined") {
        this.observer = new ResizeObserver(() => this.setSize(canvas.clientWidth, canvas.clientHeight));
        this.observer.observe(canvas);
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

    this.stats.batches = this.rasterizer.draw(ctx, queue);
    this.stats.primitives = queue.count;
    this.stats.culled = this.emitter.culled;
    this.stats.ms = performance.now() - start;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
