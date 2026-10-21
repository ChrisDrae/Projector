import { describe, expect, it } from "vitest";
import * as quat from "../../src/math/quat.js";
import { BoxContainer, PlaneCollider } from "../../src/physics/colliders.js";
import { Manifold, boxBox, capsuleBox, capsuleCapsule, sphereSphere } from "../../src/physics/rigid/narrowphase.js";
import { RigidFlags } from "../../src/physics/rigid/rigidStore.js";
import { Shapes, inertia } from "../../src/physics/rigid/shapes.js";
import { World } from "../../src/physics/world.js";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function rotationMatrix(q: ArrayLike<number>): number[] {
  const [x, y, z, w] = [q[0], q[1], q[2], q[3]];
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

function run(world: World, seconds: number): void {
  const steps = Math.round(seconds / world.fixedDt);
  for (let k = 0; k < steps; k++) world.stepFixed(world.fixedDt);
}

const v = (): { x: number; y: number; z: number } => ({ x: 0, y: 0, z: 0 });

describe("rigid shapes", () => {
  it("have the textbook inertia of solid boxes and spheres", () => {
    const box = inertia(Shapes.box(2, 4, 6), 12, v());
    expect(box.x).toBeCloseTo((12 / 12) * (16 + 36));
    expect(box.y).toBeCloseTo((12 / 12) * (4 + 36));
    expect(box.z).toBeCloseTo((12 / 12) * (4 + 16));
    expect(inertia(Shapes.sphere(2), 5, v()).x).toBeCloseTo(0.4 * 5 * 4);
    const capsule = inertia(Shapes.capsule(0.2, 1), 1, v());
    // A long thin capsule is far easier to spin around its axis
    expect(capsule.y).toBeLessThan(capsule.x / 10);
  });
});

describe("narrowphase", () => {
  it("reports sphere overlap along the line of centers", () => {
    const m = new Manifold();
    sphereSphere(0, 0, 0, 1, 1.5, 0, 0, 1, 0.01, m);
    expect(m.count).toBe(1);
    expect([m.nx, m.ny, m.nz]).toEqual([1, 0, 0]);
    expect(m.separation[0]).toBeCloseTo(-0.5);
    sphereSphere(0, 0, 0, 1, 2.5, 0, 0, 1, 0.01, m);
    expect(m.count).toBe(0);
  });

  it("gives a stacked box four face points", () => {
    const m = new Manifold();
    const h = [0.5, 0.5, 0.5];
    // B rests on A, overlapping 0.02, slightly offset
    boxBox([0, 0, 0], 0, IDENTITY, 0, h, 0, [0.1, 0.98, 0.05], 0, IDENTITY, 0, h, 0, 0.01, m);
    expect(m.count).toBe(4);
    expect(m.ny).toBeCloseTo(1);
    for (let k = 0; k < 4; k++) expect(m.separation[k]).toBeCloseTo(-0.02);
  });

  it("finds edge-to-edge contact between crossed boxes", () => {
    const m = new Manifold();
    const h = [0.5, 0.5, 0.5];
    // A turned 45 degrees around z, B 45 degrees around x and sitting on A's top edge
    const qa = quat.create();
    quat.setAxisAngle(qa, { x: 0, y: 0, z: 1 }, Math.PI / 4);
    const qb = quat.create();
    quat.setAxisAngle(qb, { x: 1, y: 0, z: 0 }, Math.PI / 4);
    const gap = Math.SQRT2 * 0.5 * 2 - 0.01;
    boxBox([0, 0, 0], 0, rotationMatrix(qa), 0, h, 0, [0, gap, 0], 0, rotationMatrix(qb), 0, h, 0, 0.02, m);
    expect(m.count).toBe(1);
    expect(m.ny).toBeCloseTo(1, 3);
    expect(m.separation[0]).toBeCloseTo(-0.01, 3);
    expect(m.points[1]).toBeCloseTo(gap / 2, 2);
  });

  it("holds parallel capsules and capsules lying on boxes at two points", () => {
    const m = new Manifold();
    capsuleCapsule([-1, 0, 0, 1, 0, 0], 0.2, [-0.5, 0.39, 0, 1.5, 0.39, 0], 0.2, 0.01, m);
    expect(m.count).toBe(2);
    expect(m.ny).toBeCloseTo(1);
    // A capsule lying across the top of a box, just touching
    capsuleBox([-0.3, 0.7, 0, 0.3, 0.7, 0], 0.2, [0, 0, 0], 0, IDENTITY, 0, [0.5, 0.5, 0.5], 0, 0.01, m);
    expect(m.count).toBeGreaterThanOrEqual(2);
    expect(m.ny).toBeCloseTo(-1);
  });
});

describe("rigid dynamics", () => {
  it("falls freely", () => {
    const world = new World({ rigid: { linearDamping: 0 } });
    const id = world.addRigidBody({ shape: Shapes.sphere(0.1), position: { x: 0, y: 10, z: 0 } });
    run(world, 0.5);
    expect(world.rigid.getVelocity(id, v()).y).toBeCloseTo(-9.8 * 0.5, 2);
  });

  it("rests a box on the ground without drifting, then sleeps", () => {
    const world = new World();
    world.addCollider(new PlaneCollider({ x: 0, y: 1, z: 0 }, 0));
    const id = world.addRigidBody({ shape: Shapes.box(0.4), position: { x: 0, y: 0.3, z: 0 } });
    run(world, 2);
    const p = world.rigid.getPosition(id, v());
    expect(p.y).toBeCloseTo(0.2, 2);
    expect(Math.abs(p.x) + Math.abs(p.z)).toBeLessThan(1e-3);
    const q = world.rigid.getRotation(id, quat.create());
    expect(Math.abs(q[3])).toBeCloseTo(1, 4);
    expect(world.rigid.isSleeping(id)).toBe(true);
    world.rigid.applyImpulse(id, { x: 0, y: 2, z: 0 });
    expect(world.rigid.isSleeping(id)).toBe(false);
  });

  it("keeps a stack of five boxes standing", () => {
    const world = new World({ friction: 0.6, restitution: 0 });
    world.addCollider(new PlaneCollider({ x: 0, y: 1, z: 0 }, 0));
    const ids: number[] = [];
    for (let k = 0; k < 5; k++) {
      ids.push(world.addRigidBody({ shape: Shapes.box(0.3), position: { x: 0.005 * k, y: 0.15 + k * 0.302, z: 0 } }));
    }
    run(world, 6);
    const top = world.rigid.getPosition(ids[4], v());
    expect(top.y).toBeGreaterThan(0.15 + 4 * 0.3 - 0.02);
    expect(Math.abs(top.x - 0.02)).toBeLessThan(0.03);
    for (const id of ids) expect(world.rigid.isSleeping(id)).toBe(true);
  });

  it("rolls a ball down a slope without slipping: spin = speed / radius", () => {
    const world = new World({ friction: 0.8, rigid: { linearDamping: 0, angularDamping: 0, sleep: false } });
    const angle = 0.3;
    world.addCollider(new PlaneCollider({ x: Math.sin(angle), y: Math.cos(angle), z: 0 }, 0));
    const r = 0.25;
    const id = world.addRigidBody({
      shape: Shapes.sphere(r),
      position: { x: Math.sin(angle) * r, y: Math.cos(angle) * r, z: 0 },
    });
    run(world, 1.5);
    const vel = world.rigid.getVelocity(id, v());
    const w = world.rigid.getAngularVelocity(id, v());
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    expect(speed).toBeGreaterThan(1);
    expect(Math.hypot(w.x, w.y, w.z) * r).toBeCloseTo(speed, 1);
    // Rolling solid ball: a = 5/7 g sin(angle)
    expect(speed).toBeCloseTo((5 / 7) * 9.8 * Math.sin(angle) * 1.5, 0);
  });

  it("conserves momentum in collisions between bodies and with particles", () => {
    const world = new World({ gravity: { x: 0, y: 0, z: 0 }, friction: 0.3, restitution: 0.5, rigid: { linearDamping: 0, angularDamping: 0 } });
    const a = world.addRigidBody({ shape: Shapes.box(0.4), position: { x: -1, y: 0.05, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, mass: 2 });
    const b = world.addRigidBody({ shape: Shapes.sphere(0.25), position: { x: 1, y: 0, z: 0.1 }, velocity: { x: -2, y: 0, z: 0 }, mass: 1 });
    const p = world.addBody({ position: { x: 0, y: 2, z: 0 }, velocity: { x: 0, y: -4, z: 0 }, radius: 0.05, mass: 0.5 });
    const momentum = (): number[] => {
      const va = world.rigid.getVelocity(a, v());
      const vb = world.rigid.getVelocity(b, v());
      const vp = world.getVelocity(p, v());
      return [2 * va.x + vb.x + 0.5 * vp.x, 2 * va.y + vb.y + 0.5 * vp.y, 2 * va.z + vb.z + 0.5 * vp.z];
    };
    const before = momentum();
    run(world, 1.5);
    const after = momentum();
    for (let k = 0; k < 3; k++) expect(after[k]).toBeCloseTo(before[k], 3);
    // They did collide
    expect(world.rigid.getVelocity(b, v()).x).toBeGreaterThan(-2);
  });

  it("keeps bodies inside a spinning container and stays finite", () => {
    const world = new World();
    const box = world.addCollider(new BoxContainer({ size: 2 }));
    box.angularVelocity.z = 3;
    const ids: number[] = [];
    for (let k = 0; k < 6; k++) {
      ids.push(world.addRigidBody({ shape: k % 2 ? Shapes.box(0.25) : Shapes.capsule(0.1, 0.15), position: { x: -0.5 + k * 0.2, y: 0, z: 0 } }));
    }
    // Two bodies exactly on top of each other: no NaN
    ids.push(world.addRigidBody({ shape: Shapes.sphere(0.1), position: { x: 0.3, y: 0.5, z: 0 } }));
    ids.push(world.addRigidBody({ shape: Shapes.sphere(0.1), position: { x: 0.3, y: 0.5, z: 0 } }));
    run(world, 3);
    const p = v();
    for (const id of ids) {
      world.rigid.getPosition(id, p);
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      expect(box.containsPoint(p, -0.05)).toBe(true);
    }
  });

  it("lets static and kinematic bodies push dynamic ones", () => {
    const world = new World();
    world.addRigidBody({ shape: Shapes.box(4, 0.2, 4), position: { x: 0, y: -0.1, z: 0 }, isStatic: true });
    const paddle = world.addRigidBody({ shape: Shapes.box(0.2, 0.5, 2), position: { x: -1, y: 0.25, z: 0 }, isKinematic: true, velocity: { x: 1, y: 0, z: 0 } });
    const ball = world.addRigidBody({ shape: Shapes.sphere(0.15), position: { x: 0, y: 0.15, z: 0 } });
    run(world, 2);
    expect(world.rigid.getPosition(paddle, v()).x).toBeCloseTo(1, 1);
    // The ball got pushed ahead of the paddle
    expect(world.rigid.getPosition(ball, v()).x).toBeGreaterThan(1.1);
    expect(world.rigid.flags[world.rigid.indexOf(paddle)] & RigidFlags.Kinematic).toBeTruthy();
  });
});
