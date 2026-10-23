import type { Canvas2DLike } from "../../src/rendering/canvas2d/rasterizer.js";

/** A Canvas2DLike that records every call, for asserting on what the rasterizer draws. */
export class RecordingContext implements Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  lineWidth = 1;
  globalAlpha = 1;
  calls: string[] = [];
  styleWrites = 0;

  beginPath(): void {
    this.calls.push("beginPath");
  }
  moveTo(): void {
    this.calls.push("moveTo");
  }
  lineTo(): void {
    this.calls.push("lineTo");
  }
  closePath(): void {
    this.calls.push("closePath");
  }
  arc(): void {
    this.calls.push("arc");
  }
  rect(): void {
    this.calls.push("rect");
  }
  fill(): void {
    this.calls.push("fill");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
  gradients: Array<{ line: number[]; stops: Array<[number, string]> }> = [];
  images: number[][] = [];
  drawImage(_image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void {
    this.images.push([dx, dy, dw, dh]);
    this.calls.push("drawImage");
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    const g = { line: [x0, y0, x1, y1], stops: [] as Array<[number, string]> };
    this.gradients.push(g);
    this.calls.push("gradient");
    return { addColorStop: (offset: number, color: string) => g.stops.push([offset, color]) } as unknown as CanvasGradient;
  }
}
