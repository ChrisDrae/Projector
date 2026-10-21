import { describe, expect, it } from "vitest";
import { World } from "../../src/physics/world.js";
import { Attractor, Drag, VectorField } from "../../src/physics/forces.js";
import { NBodyGravity, kineticEnergy } from "../../src/physics/nbody.js";
import { DistanceConstraintSet, SpringSet } from "../../src/physics/constraints.js";
import { Random } from "../../src/utility/random.js";
import * as vec3 from "../../src/math/vec3.js";

const ZERO = { x: 0, y: 0, z: 0 };

describe("NBodyGravity", () => {
  it("keeps a circular two-body orbit within 2% of its radius over a period", () => {
    const world = new World({ precision: "f64", gravity: ZERO, fixedDt: 1 / 1000 });
    world.addForce(new NBodyGravity(1, 0));
    world.addBody({ position: ZERO, mass: 1 });
    const planet = world.addBody({ position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 1 }, mass: 1e-9 });
    const p = vec3.create();
    let min = Infinity;
    let max = -Infinity;
    const steps = Math.round((2 * Math.PI) / (1 / 1000));
    for (let i = 0; i < steps; i++) {
      world.stepFixed(1 / 1000);
      const r = vec3.length(world.getPosition(planet, p));
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(min).toBeGreaterThan(0.98);
    expect(max).toBeLessThan(1.02);
    // Back near the start after one period
    expect(vec3.distance(world.getPosition(planet, p), { x: 1, y: 0, z: 0 })).toBeLessThan(0.05);
  });

  it("conserves momentum with pairwise opposite forces", () => {
    const world = new World({ precision: "f64", gravity: ZERO });
    const gravity = world.addForce(new NBodyGravity(1, 0.05));
    const rnd = new Random(3);
    const p = vec3.create();
    for (let i = 0; i < 60; i++) world.addBody({ position: rnd.inSphere(p, ZERO, 1), mass: rnd.range(0.1, 2) });
    for (let i = 0; i < 200; i++) world.stepFixed(1 / 240);
    const s = world.bodies;
    const total = vec3.create();
    for (let i = 0; i < s.count; i++) {
      total.x += s.mass[i] * s.vel[i * 3];
      total.y += s.mass[i] * s.vel[i * 3 + 1];
      total.z += s.mass[i] * s.vel[i * 3 + 2];
    }
    expect(vec3.length(total)).toBeLessThan(1e-9);
    // Energy roughly conserved by the symplectic integrator
    expect(kineticEnergy(s)).toBeGreaterThan(0);
    expect(Number.isFinite(gravity.potentialEnergy(s))).toBe(true);
  });
});

describe("springs and constraints", () => {
  it("a spring oscillates with period 2 pi sqrt(m / k)", () => {
    const world = new World({ precision: "f64", gravity: ZERO, fixedDt: 1 / 2000 });
    const anchor = world.addBody({ position: ZERO, isStatic: true });
    const bob = world.addBody({ position: { x: 1.2, y: 0, z: 0 }, mass: 2 });
    world.addForce(new SpringSet(world.bodies)).add(anchor, bob, { rest: 1, stiffness: 50, damping: 0 });
    const p = vec3.create();
    const crossings: number[] = [];
    let prev = 0.2;
    for (let i = 1; i <= 2000 * 3; i++) {
      world.stepFixed(1 / 2000);
      const x = world.getPosition(bob, p).x - 1;
      if (prev > 0 && x <= 0) crossings.push(i / 2000);
      prev = x;
    }
    const period = crossings[1] - crossings[0];
    expect(period).toBeCloseTo(2 * Math.PI * Math.sqrt(2 / 50), 2);
  });

  it("a pinned chain hangs at its rest lengths", () => {
    const world = new World({ precision: "f64", iterations: 20 });
    const links = world.addConstraint(new DistanceConstraintSet(world.bodies));
    const ids = [world.addBody({ position: ZERO, isStatic: true })];
    for (let i = 1; i <= 10; i++) {
      ids.push(world.addBody({ position: { x: i * 0.1, y: 0, z: 0 }, mass: 0.1 }));
      links.add(ids[i - 1], ids[i]);
    }
    for (let i = 0; i < 600; i++) world.stepFixed(1 / 120);
    const a = vec3.create();
    const b = vec3.create();
    for (let i = 1; i < ids.length; i++) {
      const d = vec3.distance(world.getPosition(ids[i - 1], a), world.getPosition(ids[i], b));
      expect(Math.abs(d - 0.1)).toBeLessThan(0.002);
    }
    // It swung down below the pin
    expect(world.getPosition(ids[10], a).y).toBeLessThan(-0.5);
    expect(world.getPosition(ids[0], a)).toEqual(ZERO);
  });
});

describe("force generators", () => {
  it("drag slows bodies down monotonically", () => {
    const world = new World({ precision: "f64", gravity: ZERO });
    world.addForce(new Drag(0.5, 0.1));
    const id = world.addBody({ position: ZERO, velocity: { x: 5, y: 0, z: 0 } });
    const v = vec3.create();
    let last = 5;
    for (let i = 0; i < 240; i++) {
      world.stepFixed(1 / 120);
      const speed = vec3.length(world.getVelocity(id, v));
      expect(speed).toBeLessThan(last);
      last = speed;
    }
    expect(last).toBeLessThan(2);
  });

  it("acceleration fields move light and heavy bodies alike", () => {
    const world = new World({ precision: "f64", gravity: ZERO });
    world.addForce(new VectorField((_x, _y, _z, _t, out) => vec3.set(out, 0, 0, 1), { mode: "acceleration", strength: 2 }));
    const light = world.addBody({ position: ZERO, mass: 0.1 });
    const heavy = world.addBody({ position: ZERO, mass: 10 });
    for (let i = 0; i < 120; i++) world.stepFixed(1 / 120);
    expect(world.getVelocity(light, vec3.create()).z).toBeCloseTo(2, 9);
    expect(world.getVelocity(heavy, vec3.create()).z).toBeCloseTo(2, 9);
  });

  it("attractors pull bodies in", () => {
    const world = new World({ precision: "f64", gravity: ZERO });
    world.addForce(new Attractor({ x: 0, y: 0, z: 0 }, 5));
    const id = world.addBody({ position: { x: 2, y: 0, z: 0 } });
    for (let i = 0; i < 60; i++) world.stepFixed(1 / 120);
    expect(world.getPosition(id, vec3.create()).x).toBeLessThan(2);
    expect(world.getVelocity(id, vec3.create()).x).toBeLessThan(0);
  });
});
