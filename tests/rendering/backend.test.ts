import { describe, expect, it } from "vitest";
import { Canvas2DBackend } from "../../src/rendering/canvas2d/canvas2dBackend.js";
import { RenderQueue } from "../../src/rendering/software/renderQueue.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { Mesh } from "../../src/scene/mesh.js";
import { Layer, MeshNode } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";
import { RecordingContext } from "../helpers/recordingContext.js";

/** A 2D context good enough for the backend, recording what it draws. */
class FakeContext extends RecordingContext {
  readbacks = 0;
  setTransform(): void {}
  fillRect(): void {}
  getImageData(): ImageData {
    this.readbacks++;
    return {} as ImageData;
  }
}

/** Stands in for an OffscreenCanvas (no CSS size, no DOM). */
function offscreen(width: number, height: number): { canvas: OffscreenCanvas; ctx: FakeContext } {
  const ctx = new FakeContext();
  const canvas = { width, height, getContext: () => ctx } as unknown as OffscreenCanvas;
  return { canvas, ctx };
}

function scene(): Scene {
  const s = new Scene();
  s.add(new MeshNode(Mesh.box(1)));
  return s;
}

describe("Canvas2DBackend", () => {
  it("renders to an OffscreenCanvas, sized by its attributes and setSize()", () => {
    const { canvas, ctx } = offscreen(320, 200);
    const backend = new Canvas2DBackend(canvas, { pixelRatio: 1, canvasFactory: () => null as never });
    expect([backend.width, backend.height]).toEqual([320, 200]);
    backend.render(scene(), new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }));
    expect(backend.stats.primitives).toBe(1);
    expect(ctx.calls).toContain("fill");
    backend.setSize(640, 400, 2);
    expect([canvas.width, canvas.height]).toEqual([1280, 800]);
  });

  it("waits for the canvas only with syncTiming", () => {
    const camera = new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } });
    const a = offscreen(100, 100);
    const plain = new Canvas2DBackend(a.canvas, { pixelRatio: 1 });
    plain.render(scene(), camera);
    expect(a.ctx.readbacks).toBe(0);
    expect(plain.stats.finishMs).toBeUndefined();

    const b = offscreen(100, 100);
    const synced = new Canvas2DBackend(b.canvas, { pixelRatio: 1, syncTiming: true });
    synced.render(scene(), camera);
    expect(b.ctx.readbacks).toBe(1);
    expect(synced.stats.finishMs).toBeGreaterThanOrEqual(0);
    expect(synced.stats.ms).toBeGreaterThanOrEqual(synced.stats.finishMs!);
  });

  it("passes seam and maxBatch through", () => {
    const { canvas } = offscreen(100, 100);
    const backend = new Canvas2DBackend(canvas, { seam: 0.4, maxBatch: 32 });
    expect(backend.emitter.queue.seam).toBe(0.4);
    expect(backend.rasterizer.maxBatch).toBe(32);
  });
});

describe("RenderQueue.seam", () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];

  it("grows opaque filled polygons around their center", () => {
    const q = new RenderQueue();
    q.seam = 0.5;
    q.pushPolygon(Layer.World, q.styles.intern("#fff"), 1, square, 4);
    const d = 0.5 / Math.SQRT2;
    const xs = Array.from(q.coords.subarray(0, 8));
    for (const [i, v] of xs.entries()) {
      const original = square[i] ?? 0;
      expect(Math.abs(v - original)).toBeCloseTo(d);
    }
    expect(Math.min(...xs)).toBeCloseTo(-d);
    expect(Math.max(...xs)).toBeCloseTo(10 + d);
  });

  it("leaves translucent polygons, outlines and the default alone", () => {
    const cases: Array<{ seam: number; fill: string | null; stroke: string | null; alpha: number }> = [
      { seam: 0.5, fill: "#fff", stroke: null, alpha: 0.5 },
      { seam: 0.5, fill: null, stroke: "#fff", alpha: 1 },
      { seam: 0, fill: "#fff", stroke: null, alpha: 1 },
    ];
    for (const { seam, fill, stroke, alpha } of cases) {
      const q = new RenderQueue();
      q.seam = seam;
      q.pushPolygon(Layer.World, q.styles.intern(fill, stroke, 1, alpha), 1, square, 4);
      const xs = Array.from(q.coords.subarray(0, 8)).sort((a, b) => a - b);
      expect(xs).toEqual([0, 0, 0, 0, 10, 10, 10, 10]);
    }
  });
});
