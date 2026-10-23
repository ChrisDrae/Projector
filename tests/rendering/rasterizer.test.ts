import { describe, expect, it } from "vitest";
import { Rasterizer } from "../../src/rendering/canvas2d/rasterizer.js";
import { RecordingContext } from "../helpers/recordingContext.js";
import { RenderQueue } from "../../src/rendering/software/renderQueue.js";
import { Layer } from "../../src/scene/nodes.js";

describe("Rasterizer", () => {
  it("issues one beginPath and one fill per batch", () => {
    const q = new RenderQueue();
    const green = q.styles.intern("#0f0");
    const red = q.styles.intern("#f00");
    for (let i = 0; i < 500; i++) q.pushCircle(Layer.World, green, 2, i, i, 1);
    for (let i = 0; i < 500; i++) q.pushCircle(Layer.World, red, 1, i, i, 1);
    q.sort();
    const ctx = new RecordingContext();
    const r = new Rasterizer();
    r.maxBatch = Infinity;
    const batches = r.draw(ctx, q);
    expect(batches).toBe(2);
    expect(ctx.calls.filter((c) => c === "beginPath").length).toBe(2);
    expect(ctx.calls.filter((c) => c === "fill").length).toBe(2);
    expect(ctx.calls.filter((c) => c === "arc").length).toBe(1000);
  });

  it("splits runs longer than maxBatch into several paths", () => {
    const q = new RenderQueue();
    const s = q.styles.intern("#0f0");
    for (let i = 0; i < 1000; i++) q.pushCircle(Layer.World, s, 1, i, i, 1);
    q.sort();
    const ctx = new RecordingContext();
    const r = new Rasterizer();
    expect(r.maxBatch).toBe(256);
    expect(r.draw(ctx, q)).toBe(4);
    expect(ctx.calls.filter((c) => c === "beginPath").length).toBe(4);
    expect(ctx.calls.filter((c) => c === "fill").length).toBe(4);
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
