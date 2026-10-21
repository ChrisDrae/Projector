import { describe, expect, it } from "vitest";
import { Random } from "../../src/utility/random.js";
import * as vec3 from "../../src/math/vec3.js";

describe("Random", () => {
  it("is deterministic for a seed", () => {
    const a = new Random("abc");
    const b = new Random("abc");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("stays in range", () => {
    const r = new Random(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
      const n = r.int(0, 3);
      expect([0, 1, 2]).toContain(n);
    }
  });

  it("produces unit vectors and points inside shapes", () => {
    const r = new Random(9);
    const out = vec3.create();
    const center = { x: 1, y: 2, z: 3 };
    for (let i = 0; i < 200; i++) {
      expect(vec3.length(r.unitVector(out))).toBeCloseTo(1, 12);
      expect(vec3.distance(r.inSphere(out, center, 0.5), center)).toBeLessThanOrEqual(0.5);
      r.inBox(out, center, { x: 0.1, y: 0.2, z: 0.3 });
      expect(Math.abs(out.z - 3)).toBeLessThanOrEqual(0.3);
    }
  });
});
