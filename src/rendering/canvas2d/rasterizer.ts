import { fineCss } from "../software/lighting.js";
import { PrimitiveKind, type RenderQueue, type Style } from "../software/renderQueue.js";

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
}

const TAU = Math.PI * 2;

/**
 * Draws a sorted RenderQueue: one path per batch (one beginPath, one fill and/or one stroke), and canvas
 * state is only touched when it actually changes between batches.
 */
export class Rasterizer {
  /** Draw calls of the last draw(): one per batch, plus one per gradient polygon. */
  drawCalls: number = 0;
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
    queue.forEachBatch((kind, style, start, end) => {
      this.drawBatch(ctx, queue, kind, queue.styles.get(style), start, end);
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
