import { describe, expect, it } from "vitest";
import { BodyStore } from "../../src/physics/bodyStore.js";
import { BodyFlags } from "../../src/physics/types.js";

describe("BodyStore", () => {
  it("grows without losing data", () => {
    const s = new BodyStore("f64", 2);
    for (let i = 0; i < 100; i++) s.add(i, i * 2, i * 3, 0, 0, 0, 0.1, 1 + i, BodyFlags.Collides);
    expect(s.capacity).toBeGreaterThanOrEqual(100);
    expect(s.count).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(s.pos[i * 3 + 1]).toBe(i * 2);
      expect(s.mass[i]).toBe(1 + i);
      expect(s.invMass[i]).toBeCloseTo(1 / (1 + i), 12);
    }
  });

  it("swap-removes while keeping ids stable", () => {
    const s = new BodyStore("f64");
    const ids = [0, 1, 2, 3, 4].map((i) => s.add(i, 0, 0, 0, 0, 0, 0.1 * (i + 1), 1, BodyFlags.Collides));
    expect(s.remove(ids[1])).toBe(true);
    expect(s.count).toBe(4);
    expect(s.indexOf(ids[1])).toBe(-1);
    // The last body moved into slot 1
    expect(s.indexOf(ids[4])).toBe(1);
    expect(s.pos[3]).toBe(4);
    for (const id of [ids[0], ids[2], ids[3], ids[4]]) {
      const i = s.indexOf(id);
      expect(s.ids[i]).toBe(id);
      expect(s.pos[i * 3]).toBe(id);
    }
    expect(s.remove(ids[1])).toBe(false);
  });

  it("tracks the largest colliding radius", () => {
    const s = new BodyStore();
    s.add(0, 0, 0, 0, 0, 0, 0.5, 1, 0);
    const a = s.add(0, 0, 0, 0, 0, 0, 0.2, 1, BodyFlags.Collides);
    const b = s.add(0, 0, 0, 0, 0, 0, 0.3, 1, BodyFlags.Collides);
    expect(s.maxRadius).toBeCloseTo(0.3, 6);
    s.remove(b);
    expect(s.maxRadius).toBeCloseTo(0.2, 6);
    s.setRadius(s.indexOf(a), 0.4);
    expect(s.maxRadius).toBeCloseTo(0.4, 6);
  });

  it("static bodies have no inverse mass and no velocity", () => {
    const s = new BodyStore();
    const id = s.add(0, 0, 0, 5, 5, 5, 0.1, 2, BodyFlags.Static);
    const i = s.indexOf(id);
    expect(s.invMass[i]).toBe(0);
    expect(s.vel[0]).toBe(0);
    s.setStatic(i, false);
    expect(s.invMass[i]).toBe(0.5);
  });
});
