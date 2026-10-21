import { describe, expect, it } from "vitest";
import { Rasterizer, type Canvas2DLike } from "../../src/rendering/canvas2d/rasterizer.js";
import { RenderQueue } from "../../src/rendering/software/renderQueue.js";
import { Layer } from "../../src/scene/nodes.js";

class RecordingContext implements Canvas2DLike {
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
}

describe("Rasterizer", () => {
  it("issues one beginPath and one fill per batch", () => {
    const q = new RenderQueue();
    const green = q.styles.intern("#0f0");
    const red = q.styles.intern("#f00");
    for (let i = 0; i < 500; i++) q.pushCircle(Layer.World, green, 2, i, i, 1);
    for (let i = 0; i < 500; i++) q.pushCircle(Layer.World, red, 1, i, i, 1);
    q.sort();
    const ctx = new RecordingContext();
    const batches = new Rasterizer().draw(ctx, q);
    expect(batches).toBe(2);
    expect(ctx.calls.filter((c) => c === "beginPath").length).toBe(2);
    expect(ctx.calls.filter((c) => c === "fill").length).toBe(2);
    expect(ctx.calls.filter((c) => c === "arc").length).toBe(1000);
  });

  it("starts every circle with moveTo so arcs are not joined", () => {
    const q = new RenderQueue();
    const s = q.styles.intern("#fff");
    q.pushCircle(Layer.World, s, 1, 0, 0, 2);
    q.pushCircle(Layer.World, s, 1, 10, 0, 2);
    q.sort();
    const ctx = new RecordingContext();
    new Rasterizer().draw(ctx, q);
    expect(ctx.calls).toEqual(["beginPath", "moveTo", "arc", "moveTo", "arc", "fill"]);
  });

  it("strokes line batches without filling them", () => {
    const q = new RenderQueue();
    const s = q.styles.intern(null, "#fff", 2);
    q.pushLine(Layer.World, s, 1, 0, 0, 1, 1);
    q.pushLine(Layer.World, s, 1, 1, 1, 2, 2);
    q.sort();
    const ctx = new RecordingContext();
    new Rasterizer().draw(ctx, q);
    expect(ctx.calls).toEqual(["beginPath", "moveTo", "lineTo", "moveTo", "lineTo", "stroke"]);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.strokeStyle).toBe("#fff");
  });
});
