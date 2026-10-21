import { describe, expect, it } from "vitest";
import { BoxContainer, PlaneCollider, SphereCollider } from "../../src/physics/colliders.js";
import { World } from "../../src/physics/world.js";
import * as vec3 from "../../src/math/vec3.js";
import { Random } from "../../src/utility/random.js";

describe("BoxContainer", () => {
  it("never lets bodies escape a randomly spinning, moving box", () => {
    const world = new World({ precision: "f64", restitution: 0.4 });
    const box = world.addCollider(new BoxContainer({ size: 0.5, position: { x: 0, y: 0.4, z: 0.2 } }));
    vec3.set(box.angularVelocity, 2, -3, 1.5);
    const rnd = new Random(5);
    const p = vec3.create();
    const r = 0.01;
    for (let i = 0; i < 200; i++) {
      rnd.inBox(p, box.transform.position, 0.2);
      world.addBody({ position: p, radius: r });
    }
    for (let step = 0; step < 2000; step++) {
      box.linearVelocity.x = Math.sin(step * 0.05) * 0.5;
      world.stepFixed(1 / 120);
      for (let i = 0; i < world.bodies.count; i++) {
        p.x = world.bodies.pos[i * 3];
        p.y = world.bodies.pos[i * 3 + 1];
        p.z = world.bodies.pos[i * 3 + 2];
        if (!box.containsPoint(p, r - 1e-9)) throw new Error(`body ${i} escaped at step ${step}`);
      }
    }
  });

  it("transfers the wall velocity: a wall moving at 1 m/s launches a resting body at (1 + e) m/s", () => {
    const e = 0.5;
    const world = new World({ precision: "f64", gravity: { x: 0, y: 0, z: 0 }, restitution: e });
    const box = world.addCollider(new BoxContainer({ size: 1 }));
    box.linearVelocity.x = 1;
    const r = 0.05;
    const id = world.addBody({ position: { x: -0.5 + r, y: 0, z: 0 }, radius: r });
    world.stepFixed(1 / 120);
    expect(world.getVelocity(id, vec3.create()).x).toBeCloseTo(1 + e, 9);
  });

  it("caps the transferred speed", () => {
    const world = new World({ precision: "f64", gravity: { x: 0, y: 0, z: 0 }, restitution: 0 });
    const box = world.addCollider(new BoxContainer({ size: 1, maxTransferSpeed: 2 }));
    box.linearVelocity.x = 50;
    const id = world.addBody({ position: { x: 0.3, y: 0, z: 0 }, radius: 0.05 });
    world.stepFixed(1 / 60);
    expect(world.getVelocity(id, vec3.create()).x).toBeCloseTo(2, 9);
  });
});

describe("PlaneCollider and SphereCollider", () => {
  it("rests bodies on a floor", () => {
    const world = new World({ precision: "f64", restitution: 0.3 });
    world.addCollider(PlaneCollider.fromPointNormal({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }));
    const id = world.addBody({ position: { x: 0, y: 1, z: 0 }, radius: 0.1 });
    for (let i = 0; i < 600; i++) world.stepFixed(1 / 120);
    const p = world.getPosition(id, vec3.create());
    expect(p.y).toBeCloseTo(-0.9, 3);
    expect(Math.abs(world.getVelocity(id, vec3.create()).y)).toBeLessThan(0.2);
  });

  it("keeps bodies outside an obstacle and inside a bowl", () => {
    const world = new World({ precision: "f64", gravity: { x: 0, y: 0, z: 0 } });
    world.addCollider(new SphereCollider({ x: 0, y: 0, z: 0 }, 0.5));
    world.addCollider(new SphereCollider({ x: 0, y: 0, z: 0 }, 2, { inside: true }));
    const a = world.addBody({ position: { x: 0.1, y: 0, z: 0 }, radius: 0.1 });
    const b = world.addBody({ position: { x: 0, y: 3, z: 0 }, radius: 0.1 });
    world.stepFixed(1 / 120);
    expect(vec3.length(world.getPosition(a, vec3.create()))).toBeCloseTo(0.6, 9);
    expect(vec3.length(world.getPosition(b, vec3.create()))).toBeCloseTo(1.9, 9);
  });
});
