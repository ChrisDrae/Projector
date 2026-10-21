import { fineCss, quantize, quantizedCss } from "../software/lighting.js";
import { PrimitiveKind, type RenderQueue, type Style } from "../software/renderQueue.js";
import { spriteAverage, type SpriteParams } from "../software/sprites.js";

/** Turns sprite ids into images, e.g. a SpriteCache. */
export interface SpriteSource {
  /** An image of the sprite at least `pixels` device pixels across, or null to draw a plain circle. */
  get(id: number, params: SpriteParams, pixels: number, generation: number): CanvasImageSource | null;
}

const average = { r: 0, g: 0, b: 0 };

/** The subset of CanvasRenderingContext2D the rasterizer uses (handy for tests and offscreen canvases). */
export interface Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

const TAU = Math.PI * 2;

/**
 * Draws a sorted RenderQueue: one path per batch (one beginPath, one fill and/or one stroke), and canvas
 * state is only touched when it actually changes between batches.
 */
export class Rasterizer {
  /** Draw calls of the last draw(): one per batch, plus one per gradient polygon and sprite. */
  drawCalls: number = 0;
  /** Images for sprites; without them sprites are drawn as plain circles of their average color. */
  sprites: SpriteSource | null = null;
  /** Device pixels per CSS pixel, to pick sprite resolutions. */
  pixelRatio: number = 1;
  /**
   * Most primitives drawn as one path. Browsers fill one path of many overlapping shapes
   * disproportionately slowly (in Chrome 14,000 overlapping quads took ~350 ms as one path, 23 ms in
   * batches of 256), so longer runs of one style are split. 256 was as fast as or faster than unlimited
   * in every demo measured; see docs/requirements-feedback.md (R5).
   */
  maxBatch: number = 256;
  private fill: string | null = null;
  /** CSS of fine color keys (gradient stops), made once each. */
  private readonly css: Array<string | undefined> = [];
  private stroke: string | null = null;
  private lineWidth: number = -1;
  private alpha: number = -1;

  /** Forget cached canvas state (call after the canvas was resized or drawn to directly). */
  reset(): void {
    this.fill = null;
    this.stroke = null;
    this.lineWidth = -1;
    this.alpha = -1;
  }

  /** Returns the number of draw calls: batches, with every gradient polygon counted on its own. */
  draw(ctx: Canvas2DLike, queue: RenderQueue): number {
    this.drawCalls = 0;
    const max = Math.max(1, this.maxBatch);
    queue.forEachBatch((kind, style, start, end) => {
      if (kind === PrimitiveKind.Sprite) {
        this.drawSprites(ctx, queue, style, start, end);
        return;
      }
      const s = queue.styles.get(style);
      for (let from = start; from < end; from += max) this.drawBatch(ctx, queue, kind, s, from, Math.min(end, from + max));
    });
    return this.drawCalls;
  }

  drawBatch(ctx: Canvas2DLike, queue: RenderQueue, kind: PrimitiveKind, style: Style, start: number, end: number): void {
    this.apply(ctx, style);
    const { order, offset, size } = queue;
    const c = queue.coords;
    if (kind === PrimitiveKind.GradientPolygon) {
      this.drawGradients(ctx, queue, style, start, end);
      return;
    }
    this.drawCalls++;
    ctx.beginPath();
    switch (kind) {
      case PrimitiveKind.Polygon:
        for (let i = start; i < end; i++) {
          const p = order[i];
          const o = offset[p];
          const n = size[p];
          ctx.moveTo(c[o], c[o + 1]);
          for (let k = 1; k < n; k++) ctx.lineTo(c[o + k * 2], c[o + k * 2 + 1]);
          ctx.closePath();
        }
        break;
      case PrimitiveKind.Line:
        for (let i = start; i < end; i++) {
          const o = offset[order[i]];
          ctx.moveTo(c[o], c[o + 1]);
          ctx.lineTo(c[o + 2], c[o + 3]);
        }
        break;
      case PrimitiveKind.Circle:
        for (let i = start; i < end; i++) {
          const o = offset[order[i]];
          const r = c[o + 2];
          // Start each circle on its own subpath, or arc() connects it to the previous one
          ctx.moveTo(c[o] + r, c[o + 1]);
          ctx.arc(c[o], c[o + 1], r, 0, TAU);
        }
        break;
      case PrimitiveKind.Point:
        for (let i = start; i < end; i++) {
          const o = offset[order[i]];
          const s = c[o + 2];
          ctx.rect(c[o] - s / 2, c[o + 1] - s / 2, s, s);
        }
        break;
    }
    if (kind !== PrimitiveKind.Line && style.fill !== null) ctx.fill();
    if (style.stroke !== null) ctx.stroke();
  }

  /** Gradients can't share a path: every polygon gets its own gradient and fill. */
  private drawGradients(ctx: Canvas2DLike, queue: RenderQueue, style: Style, start: number, end: number): void {
    const { order, offset, size } = queue;
    const c = queue.coords;
    for (let i = start; i < end; i++) {
      const p = order[i];
      const o = offset[p];
      const n = size[p];
      const g = o + n * 2;
      const gradient = ctx.createLinearGradient(c[g], c[g + 1], c[g + 2], c[g + 3]);
      gradient.addColorStop(0, this.cssOf(c[g + 4]));
      gradient.addColorStop(1, this.cssOf(c[g + 5]));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(c[o], c[o + 1]);
      for (let k = 1; k < n; k++) ctx.lineTo(c[o + k * 2], c[o + k * 2 + 1]);
      ctx.closePath();
      ctx.fill();
      if (style.stroke !== null) ctx.stroke();
      this.drawCalls++;
    }
    // The fill style is a gradient now: the next batch must set its color again
    this.fill = null;
  }

  /** A run of one sprite: an image per sphere, or one path of circles in its average color. */
  private drawSprites(ctx: Canvas2DLike, queue: RenderQueue, id: number, start: number, end: number): void {
    if (this.alpha !== 1) {
      ctx.globalAlpha = 1;
      this.alpha = 1;
    }
    const { order, offset } = queue;
    const c = queue.coords;
    const params = queue.sprites.get(id);
    const generation = queue.sprites.generation;
    if (this.sprites) {
      // Spheres whose image isn't ready are drawn as circles in one path below
      let missing = 0;
      for (let i = start; i < end; i++) {
        const p = order[i];
        const o = offset[p];
        const r = c[o + 2];
        const image = this.sprites.get(id, params, 2 * r * this.pixelRatio, generation);
        if (!image) {
          order[start + missing++] = p;
          continue;
        }
        ctx.drawImage(image, c[o] - r, c[o + 1] - r, 2 * r, 2 * r);
        this.drawCalls++;
      }
      if (missing === 0) return;
      end = start + missing;
    }
    spriteAverage(params, average);
    const fill = quantizedCss(quantize(average.r, average.g, average.b));
    if (fill !== this.fill) {
      ctx.fillStyle = fill;
      this.fill = fill;
    }
    ctx.beginPath();
    for (let i = start; i < end; i++) {
      const o = offset[order[i]];
      const r = c[o + 2];
      ctx.moveTo(c[o] + r, c[o + 1]);
      ctx.arc(c[o], c[o + 1], r, 0, TAU);
    }
    ctx.fill();
    this.drawCalls++;
  }

  private cssOf(key: number): string {
    let s = this.css[key];
    if (s === undefined) {
      s = fineCss(key);
      this.css[key] = s;
    }
    return s;
  }

  private apply(ctx: Canvas2DLike, style: Style): void {
    if (style.fill !== null && style.fill !== this.fill) {
      ctx.fillStyle = style.fill;
      this.fill = style.fill;
    }
    if (style.stroke !== null) {
      if (style.stroke !== this.stroke) {
        ctx.strokeStyle = style.stroke;
        this.stroke = style.stroke;
      }
      if (style.lineWidth !== this.lineWidth) {
        ctx.lineWidth = style.lineWidth;
        this.lineWidth = style.lineWidth;
      }
    }
    if (style.alpha !== this.alpha) {
      ctx.globalAlpha = style.alpha;
      this.alpha = style.alpha;
    }
  }
}
