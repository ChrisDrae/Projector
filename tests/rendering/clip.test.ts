import { describe, expect, it } from "vitest";
import { clipPolygonNear, clipSegmentNear } from "../../src/rendering/software/clip.js";

describe("near-plane clipping", () => {
  const near = 0.1;

  it("keeps polygons fully in front unchanged", () => {
    const tri = [0, 0, 1, 1, 0, 1, 0, 1, 2];
    const out = new Float64Array(18);
    expect(clipPolygonNear(near, tri, 3, out)).toBe(3);
    expect(Array.from(out.subarray(0, 9))).toEqual(tri);
  });

  it("turns a triangle with one vertex behind into a quad on the near plane", () => {
    const tri = [0, 0, 1, 1, 0, 1, 0, 0, -1];
    const out = new Float64Array(18);
    const n = clipPolygonNear(near, tri, 3, out);
    expect(n).toBe(4);
    for (let i = 0; i < n; i++) expect(out[i * 3 + 2]).toBeGreaterThanOrEqual(near - 1e-12);
    expect(Array.from(out.subarray(0, 12)).filter((_, i) => i % 3 === 2 && out[i] === near).length).toBe(2);
  });

  it("drops polygons fully behind", () => {
    const out = new Float64Array(18);
    expect(clipPolygonNear(near, [0, 0, -1, 1, 0, -1, 0, 1, -2], 3, out)).toBe(0);
  });

  it("moves the hidden endpoint of a segment onto the near plane", () => {
    const s = Float64Array.from([0, 0, -1, 2, 2, 1]);
    expect(clipSegmentNear(near, s)).toBe(true);
    expect(s[2]).toBe(near);
    // Point on the original line at z = near
    const t = (near + 1) / 2;
    expect(s[0]).toBeCloseTo(2 * t, 12);
    expect(s[1]).toBeCloseTo(2 * t, 12);
    expect(Array.from(s.subarray(3))).toEqual([2, 2, 1]);
  });

  it("rejects segments fully behind", () => {
    expect(clipSegmentNear(near, Float64Array.from([0, 0, -1, 1, 1, 0]))).toBe(false);
  });
});
