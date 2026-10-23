import { describe, expect, it } from "vitest";
import { BodyStore } from "../../src/physics/bodyStore.js";
import { solveContacts } from "../../src/physics/contacts.js";
import { BodyFlags, type SolverSettings } from "../../src/physics/types.js";

const settings = (restitution: number): SolverSettings => ({
  restitution,
  friction: 0,
  positionCorrection: 0.8,
  slop: 0,
  restThreshold: 0,
});

function collide(m1: number, v1: number, m2: number, v2: number, e: number): [number, number] {
  const s = new BodyStore("f64");
  s.add(0, 0, 0, v1, 0, 0, 0.1, m1, BodyFlags.Collides);
  s.add(0.19, 0, 0, v2, 0, 0, 0.1, m2, BodyFlags.Collides);
  solveContacts(s, Int32Array.from([0, 1]), 1, settings(e));
  return [s.vel[0], s.vel[3]];
}

describe("sphere-sphere contacts", () => {
  it("swaps velocities for equal masses with e = 1", () => {
    const [a, b] = collide(1, 1, 1, -1, 1);
    expect(a).toBeCloseTo(-1, 12);
    expect(b).toBeCloseTo(1, 12);
  });

  it("matches the 1D elastic formula for unequal masses", () => {
    const [a, b] = collide(1, 2, 3, 0, 1);
    expect(a).toBeCloseTo(((1 - 3) / 4) * 2, 12);
    expect(b).toBeCloseTo(((2 * 1) / 4) * 2, 12);
  });

  it("gives a common velocity for e = 0", () => {
    const [a, b] = collide(1, 2, 3, 0, 0);
    expect(a).toBeCloseTo(0.5, 12);
    expect(b).toBeCloseTo(0.5, 12);
  });

  it("does not bounce bodies that already separate", () => {
    const [a, b] = collide(1, -1, 1, 1, 1);
    expect(a).toBe(-1);
    expect(b).toBe(1);
  });

  it("separates overlaps weighted by inverse mass, keeping the center of mass", () => {
    const s = new BodyStore("f64");
    s.add(0, 0, 0, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    s.add(0.1, 0, 0, 0, 0, 0, 0.1, 3, BodyFlags.Collides);
    const com = (s.pos[0] * 1 + s.pos[3] * 3) / 4;
    const set = { ...settings(0), positionCorrection: 1 };
    solveContacts(s, Int32Array.from([0, 1]), 1, set);
    expect(s.pos[3] - s.pos[0]).toBeCloseTo(0.2, 12);
    expect((s.pos[0] * 1 + s.pos[3] * 3) / 4).toBeCloseTo(com, 12);
    // The lighter body moved three times as far
    expect(-s.pos[0]).toBeCloseTo(3 * (s.pos[3] - 0.1), 12);
  });

  it("pushes coincident bodies apart without NaN", () => {
    const s = new BodyStore("f64");
    s.add(1, 1, 1, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    s.add(1, 1, 1, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    solveContacts(s, Int32Array.from([0, 1]), 1, settings(0.5));
    for (let i = 0; i < 6; i++) expect(Number.isFinite(s.pos[i])).toBe(true);
    const d = Math.hypot(s.pos[3] - s.pos[0], s.pos[4] - s.pos[1], s.pos[5] - s.pos[2]);
    expect(d).toBeGreaterThan(0.1);
  });

  it("leaves static bodies in place", () => {
    const s = new BodyStore("f64");
    s.add(0, 0, 0, 0, 0, 0, 0.1, 1, BodyFlags.Collides | BodyFlags.Static);
    s.add(0.15, 0, 0, -1, 0, 0, 0.1, 1, BodyFlags.Collides);
    solveContacts(s, Int32Array.from([0, 1]), 1, settings(1));
    expect(s.pos[0]).toBe(0);
    expect(s.vel[0]).toBe(0);
    expect(s.vel[3]).toBeCloseTo(1, 12);
  });
});
