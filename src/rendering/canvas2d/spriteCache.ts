import { renderSprite, type SpriteParams } from "../software/sprites.js";
import type { SpriteSource } from "./rasterizer.js";

/** Something to render sprites into: an OffscreenCanvas or a canvas element. */
export type SpriteCanvas = OffscreenCanvas | HTMLCanvasElement;

/** Makes a canvas of the given size, in pixels. */
export type CanvasFactory = (width: number, height: number) => SpriteCanvas;

/** Sprite resolutions: the smallest that covers the sphere's size on screen is used. */
const SIZES = [16, 32, 64, 128] as const;

/** OffscreenCanvas where available, else a canvas element; null without either (Node). */
export function defaultCanvasFactory(): CanvasFactory | null {
  if (typeof OffscreenCanvas !== "undefined") return (w, h) => new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    return (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
  }
  return null;
}

/**
 * Renders sprites into small canvases on first use and keeps them: each sphere is then one drawImage of
 * a ready image. The pixels are computed once per sprite and resolution (per-pixel lighting on at most
 * 128 x 128 pixels), never per frame. When more than `maxImages` pile up, the cache starts over.
 */
export class SpriteCache implements SpriteSource {
  maxImages: number;
  /** Images rendered since the cache was made (cost shows up here, not per frame). */
  rendered: number = 0;
  private readonly factory: CanvasFactory;
  private readonly images: Map<number, SpriteCanvas> = new Map();
  private generation: number = 0;

  constructor(factory: CanvasFactory, maxImages: number = 2048) {
    this.factory = factory;
    this.maxImages = maxImages;
  }

  get(id: number, params: SpriteParams, pixels: number, generation: number): CanvasImageSource | null {
    if (generation !== this.generation) {
      this.images.clear();
      this.generation = generation;
    }
    let level = 0;
    while (level < SIZES.length - 1 && SIZES[level] < pixels) level++;
    const key = id * SIZES.length + level;
    const cached = this.images.get(key);
    if (cached) return cached;
    if (this.images.size >= this.maxImages) this.images.clear();
    const image = this.render(params, SIZES[level]);
    if (image) this.images.set(key, image);
    return image;
  }

  clear(): void {
    this.images.clear();
  }

  private render(params: SpriteParams, size: number): SpriteCanvas | null {
    const canvas = this.factory(size, size);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    const pixels = ctx.createImageData(size, size);
    renderSprite(params, size, pixels.data);
    ctx.putImageData(pixels, 0, 0);
    this.rendered++;
    return canvas;
  }
}
