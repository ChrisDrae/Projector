import { describe, expect, it } from "vitest";
import { PrimitiveKind, RenderQueue } from "../../src/rendering/software/renderQueue.js";
import { Layer } from "../../src/scene/nodes.js";

function batches(q: RenderQueue): Array<{ kind: number; style: number; size: number }> {
  const out: Array<{ kind: number; style: number; size: number }> = [];
  q.forEachBatch((kind, style, start, end) => out.push({ kind, style, size: end - start }));
  return out;
}

describe("RenderQueue", () => {
  it("collapses 1000 same-style circles into a single batch", () => {
    const q = new RenderQueue(16);
    const style = q.styles.intern("#fff");
    for (let i = 0; i < 1000; i++) q.pushCircle(Layer.World, style, Math.random() * 10, i, i, 1);
    q.sort();
    expect(batches(q)).toEqual([{ kind: PrimitiveKind.Circle, style, size: 1000 }]);
  });

  it("orders depth-sorted layers far to near", () => {
    const q = new RenderQueue();
    const s = q.styles.intern("#fff");
    const depths = [3, 9, 1, 7, 5];
    depths.forEach((d, i) => q.pushCircle(Layer.World, s, d, i, 0, 1));
    q.sort();
    const drawn = Array.from(q.order.subarray(0, q.count)).map((i) => q.depth[i]);
    expect(drawn).toEqual([9, 7, 5, 3, 1]);
  });

  it("draws layers in order and groups unsorted layers by style", () => {
    const q = new RenderQueue();
    const a = q.styles.intern(null, "#a00");
    const b = q.styles.intern(null, "#0b0");
    q.pushLine(Layer.Overlay, a, 1, 0, 0, 1, 1);
    q.pushLine(Layer.Background, a, 1, 0, 0, 1, 1);
    q.pushLine(Layer.Background, b, 1, 0, 0, 1, 1);
    q.pushLine(Layer.Background, a, 1, 0, 0, 1, 1);
    q.pushCircle(Layer.World, q.styles.intern("#fff"), 2, 0, 0, 1);
    q.sort();
    const layers = Array.from(q.order.subarray(0, q.count)).map((i) => q.layer[i]);
    expect(layers).toEqual([0, 0, 0, 1, 2]);
    // background: the two "a" lines are adjacent
    expect(batches(q).map((x) => x.size)).toEqual([2, 1, 1, 1]);
  });

  it("normalizes polygon winding so shared paths never cancel", () => {
    const q = new RenderQueue();
    const s = q.styles.intern("#fff");
    q.pushPolygon(Layer.World, s, 1, [0, 0, 10, 0, 10, 10], 3);
    q.pushPolygon(Layer.World, s, 1, [0, 0, 10, 10, 10, 0], 3);
    const area = (o: number): number => {
      const c = q.coords;
      let a = 0;
      for (let i = 0, j = 2; i < 3; j = i++) a += c[o + j * 2] * c[o + i * 2 + 1] - c[o + i * 2] * c[o + j * 2 + 1];
      return a;
    };
    expect(Math.sign(area(q.offset[0]))).toBe(Math.sign(area(q.offset[1])));
  });

  it("grows past its initial capacity", () => {
    const q = new RenderQueue(4);
    const s = q.styles.intern("#fff");
    for (let i = 0; i < 100; i++) q.pushPolygon(Layer.World, s, i, [0, 0, i + 1, 0, 0, i + 1], 3);
    q.sort();
    expect(q.count).toBe(100);
    expect(q.depth[q.order[0]]).toBe(99);
  });
});
