import { describe, expect, it } from "vitest";
import { Vec } from "../../src/math/vec.js";

describe("Vec", () => {
  it("instance distanceTo uses the z component (was this.y)", () => {
    const a = new Vec({ x: 0, y: 5, z: 0 });
    const b = new Vec({ x: 0, y: 5, z: 3 });
    expect(a.distanceTo(b)).toBe(3);
    expect(a.distanceTo(b)).toBe(Vec.distanceTo(a, b));
  });

  it("normalizing a zero vector returns zero instead of NaN", () => {
    const n = Vec.getNormalvector({ x: 0, y: 0, z: 0 });
    expect(n).toEqual(new Vec({ x: 0, y: 0, z: 0 }));
  });

  it("static helpers always return Vec instances", () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: 5, z: 6 };
    expect(Vec.addVectors(a, b)).toBeInstanceOf(Vec);
    expect(Vec.subtractVectors(a, b)).toBeInstanceOf(Vec);
    expect(Vec.scaleVector(a, 2)).toBeInstanceOf(Vec);
    expect(Vec.divideVector(a, 2)).toBeInstanceOf(Vec);
    expect(Vec.addVectors(a, b)).toEqual(new Vec({ x: 5, y: 7, z: 9 }));
  });

  it("computes dot, cross and magnitude", () => {
    expect(Vec.dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
    expect(Vec.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual(new Vec({ x: 0, y: 0, z: 1 }));
    expect(new Vec({ x: 3, y: 4, z: 0 }).magnitude()).toBe(5);
    expect(new Vec({ x: 1, y: 1, z: 1 }).scaleSelf(2)).toEqual(new Vec({ x: 2, y: 2, z: 2 }));
  });
});
