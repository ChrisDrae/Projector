import { describe, expect, it } from "vitest";
import { World } from "../../src/physics/world.js";
import type { Precision } from "../../src/physics/types.js";
import { Random } from "../../src/utility/random.js";
import * as vec3 from "../../src/math/vec3.js";

function momentum(world: World): { p: vec3.Vec3; com: vec3.Vec3; mass: number } {
  const s = world.bodies;
  const p = vec3.create();
  const com = vec3.create();
  let mass = 0;
  for (let i = 0; i < s.count; i++) {
    const m = s.mass[i];
    p.x += m * s.vel[i * 3];
    p.y += m * s.vel[i * 3 + 1];
    p.z += m * s.vel[i * 3 + 2];
    com.x += m * s.pos[i * 3];
    com.y += m * s.pos[i * 3 + 1];
    com.z += m * s.pos[i * 3 + 2];
    mass += m;
  }
  return { p, com: vec3.scale(com, com, 1 / mass), mass };
}

function crowd(precision: Precision): World {
  const world = new World({ precision, gravity: { x: 0, y: 0, z: 0 }, restitution: 0.7, friction: 0.3 });
  const rnd = new Random(42);
  const p = vec3.create();
  const v = vec3.create();
  for (let i = 0; i < 200; i++) {
    rnd.inSphere(p, { x: 0, y: 0, z: 0 }, 0.4);
    rnd.unitVector(v);
    vec3.scale(v, v, rnd.range(0, 2));
    world.addBody({ position: p, velocity: v, radius: rnd.range(0.02, 0.05), mass: rnd.range(0.5, 3) });
  }
  return world;
}

describe("World", () => {
  for (const [precision, tolerance] of [
    ["f64", 1e-9],
    ["f32", 1e-4],
  ] as const) {
    it(`conserves momentum and moves the center of mass linearly (${precision})`, () => {
      const world = crowd(precision);
      const start = momentum(world);
      const scale = start.mass * 2;
      let pairs = 0;
      for (let i = 0; i < 300; i++) {
        world.stepFixed(1 / 120);
        pairs += world.stats.pairs;
      }
      expect(pairs).toBeGreaterThan(0);
      const end = momentum(world);
      expect(Math.abs(end.p.x - start.p.x) / scale).toBeLessThan(tolerance);
      expect(Math.abs(end.p.y - start.p.y) / scale).toBeLessThan(tolerance);
      expect(Math.abs(end.p.z - start.p.z) / scale).toBeLessThan(tolerance);
      const t = 300 / 120;
      const expected = vec3.scaleAndAdd(vec3.create(), start.com, start.p, t / start.mass);
      expect(vec3.distance(end.com, expected)).toBeLessThan(precision === "f64" ? 1e-9 : 1e-4);
    });
  }

  it("runs fixed substeps and carries the remainder", () => {
    const world = new World({ fixedDt: 1 / 120 });
    expect(world.step(1 / 60)).toBe(2);
    expect(world.step(1 / 240)).toBe(0);
    expect(world.step(1 / 240)).toBe(1);
    // A huge frame is capped instead of spiralling
    expect(world.step(1)).toBe(8);
    expect(world.step(1 / 240)).toBe(0);
  });

  it("scales time", () => {
    const world = new World({ fixedDt: 1 / 120, timeScale: 0.5 });
    expect(world.step(1 / 60)).toBe(1);
  });

  it("integrates gravity like free fall", () => {
    const world = new World({ precision: "f64" });
    const id = world.addBody({ position: { x: 0, y: 0, z: 0 } });
    for (let i = 0; i < 120; i++) world.stepFixed(1 / 120);
    expect(world.getVelocity(id, vec3.create()).y).toBeCloseTo(-9.8, 9);
    // Semi-implicit Euler: within one step of the analytic -g t^2 / 2
    expect(world.getPosition(id, vec3.create()).y).toBeCloseTo(-4.9, 1);
  });

  it("applies forces and impulses by inverse mass", () => {
    const world = new World({ precision: "f64", gravity: { x: 0, y: 0, z: 0 } });
    const id = world.addBody({ position: { x: 0, y: 0, z: 0 }, mass: 2 });
    world.applyImpulse(id, { x: 4, y: 0, z: 0 });
    expect(world.getVelocity(id, vec3.create()).x).toBe(2);
    world.applyForce(id, { x: 0, y: 240, z: 0 });
    world.stepFixed(1 / 120);
    expect(world.getVelocity(id, vec3.create()).y).toBeCloseTo(1, 12);
    world.stepFixed(1 / 120);
    expect(world.getVelocity(id, vec3.create()).y).toBeCloseTo(1, 12);
  });
});
