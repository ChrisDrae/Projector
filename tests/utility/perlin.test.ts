import { describe, expect, it } from "vitest";
import { PerlinNoise, toUnit } from "../../src/utility/perlin.js";

describe("PerlinNoise", () => {
  it("is deterministic for a seed", () => {
    const a = new PerlinNoise("seed");
    const b = new PerlinNoise("seed");
    for (let i = 0; i < 50; i++) {
      const x = i * 0.137;
      expect(a.noise3D(x, x * 2, x * 3)).toBe(b.noise3D(x, x * 2, x * 3));
    }
  });

  it("returns 0 on integer lattice points", () => {
    const n = new PerlinNoise(42);
    expect(n.noise2D(3, 7)).toBeCloseTo(0, 12);
    expect(n.noise3D(1, 2, 3)).toBeCloseTo(0, 12);
  });

  it("stays roughly within [-1, 1]", () => {
    const n = new PerlinNoise(1);
    for (let i = 0; i < 2000; i++) {
      const v = n.fbm3D(i * 0.031, i * 0.017, i * 0.023, { octaves: 5 });
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
    expect(toUnit(-1)).toBe(0);
    expect(toUnit(1)).toBe(1);
  });
});
