import { describe, expect, it } from "vitest";
import { PlaneCollider } from "../../src/physics/colliders.js";
import { Shapes } from "../../src/physics/rigid/shapes.js";
import type { Collider, StaticShapeSink } from "../../src/physics/types.js";
import { World } from "../../src/physics/world.js";

function run(world: World, seconds: number): void {
  const steps = Math.round(seconds / world.fixedDt);
  for (let k = 0; k < steps; k++) world.stepFixed(world.fixedDt);
}

const v = (): { x: number; y: number; z: number } => ({ x: 0, y: 0, z: 0 });

/**
 * Unit blocks like a voxel world: a floor layer with its top at y = 0 over x, z in [-5, 5), and one
 * block on it at (2, 0, 0) with its top at y = 1. Reports the blocks around each body as boxes.
 */
class Blocks implements Collider {
  friction: number | null = null;
  restitution: number | null = null;
  queries = 0;

  solid(x: number, y: number, z: number): boolean {
    if (x === 2 && y === 0 && z === 0) return true;
    return y === -1 && x >= -5 && x < 5 && z >= -5 && z < 5;
  }

  update(): void {}
  solve(): void {}

  rigidShapes(x: number, y: number, z: number, r: number, out: StaticShapeSink): void {
    this.queries++;
    for (let by = Math.floor(y - r); by <= Math.floor(y + r); by++) {
      for (let bz = Math.floor(z - r); bz <= Math.floor(z + r); bz++) {
        for (let bx = Math.floor(x - r); bx <= Math.floor(x + r); bx++) {
          if (this.solid(bx, by, bz)) out.box(bx + 0.5, by + 0.5, bz + 0.5, 0.5, 0.5, 0.5);
        }
      }
    }
  }
}

describe("custom colliders and rigid bodies", () => {
  it("rests boxes, spheres and capsules on reported boxes, and lets them sleep", () => {
    const world = new World({ friction: 0.6, restitution: 0 });
    const blocks = world.addCollider(new Blocks());
    const box = world.addRigidBody({ shape: Shapes.box(0.4), position: { x: 0.3, y: 1, z: 0.3 } });
    const ball = world.addRigidBody({ shape: Shapes.sphere(0.2), position: { x: -1.5, y: 1, z: 0.5 } });
    const pill = world.addRigidBody({ shape: Shapes.capsule(0.15, 0.3), position: { x: 0.5, y: 1, z: -1.5 } });
    const onStep = world.addRigidBody({ shape: Shapes.box(0.4), position: { x: 2.5, y: 2, z: 0.5 } });
    run(world, 4);
    expect(blocks.queries).toBeGreaterThan(0);
    expect(world.rigid.getPosition(box, v()).y).toBeCloseTo(0.2, 2);
    expect(world.rigid.getPosition(ball, v()).y).toBeCloseTo(0.2, 2);
    // Upright or toppled, the capsule lies on the floor
    const p = world.rigid.getPosition(pill, v()).y;
    expect(p).toBeGreaterThan(0.14);
    expect(p).toBeLessThan(0.46);
    expect(world.rigid.getPosition(onStep, v()).y).toBeCloseTo(1.2, 2);
    for (const id of [box, ball, onStep]) expect(world.rigid.isSleeping(id)).toBe(true);
  });

  it("lets rigid bodies through a custom collider without rigidShapes", () => {
    const world = new World();
    const blind: Collider = { update() {}, solve() {} };
    world.addCollider(blind);
    const id = world.addRigidBody({ shape: Shapes.box(0.4), position: { x: 0, y: 1, z: 0 } });
    run(world, 1);
    expect(world.rigid.getPosition(id, v()).y).toBeLessThan(-1);
  });

  it("collides with reported planes and spheres like the built-in colliders", () => {
    const reference = new World();
    reference.addCollider(new PlaneCollider({ x: 0, y: 1, z: 0 }, 0));
    const a = reference.addRigidBody({ shape: Shapes.box(0.4), position: { x: 0, y: 0.6, z: 0 } });

    const world = new World();
    world.addCollider({
      update() {},
      solve() {},
      rigidShapes(_x, _y, _z, _r, out) {
        out.plane(0, 1, 0, 0);
        out.sphere(3, 0, 0, 1);
      },
    });
    const b = world.addRigidBody({ shape: Shapes.box(0.4), position: { x: 0, y: 0.6, z: 0 } });
    const ball = world.addRigidBody({ shape: Shapes.sphere(0.25), position: { x: 3, y: 2, z: 0 } });
    run(reference, 2);
    run(world, 2);
    expect(world.rigid.getPosition(b, v()).y).toBeCloseTo(reference.rigid.getPosition(a, v()).y, 4);
    // The ball lands on top of the sphere (or rolls off it), never inside it
    const q = world.rigid.getPosition(ball, v());
    expect(Math.hypot(q.x - 3, q.y, q.z)).toBeGreaterThan(1.2);
  });

  it("uses the collider's restitution, bouncing like a built-in collider", () => {
    function bounce(restitution: number | null, builtIn: boolean = false): number {
      const world = new World({ restitution: 0, rigid: { sleep: false } });
      if (builtIn) {
        world.addCollider(new PlaneCollider({ x: 0, y: 1, z: 0 }, 0, { restitution: restitution ?? undefined }));
      } else {
        const blocks = new Blocks();
        blocks.restitution = restitution;
        world.addCollider(blocks);
      }
      const id = world.addRigidBody({ shape: Shapes.sphere(0.2), position: { x: 0.5, y: 2, z: 0.5 } });
      let landed = false;
      let peak = 0;
      const p = v();
      for (let k = 0; k < Math.round(2 / world.fixedDt); k++) {
        world.stepFixed(world.fixedDt);
        world.rigid.getPosition(id, p);
        if (p.y < 0.25) landed = true;
        if (landed) peak = Math.max(peak, p.y);
      }
      return peak;
    }
    const builtIn = bounce(0.8, true);
    expect(bounce(0.8)).toBeCloseTo(builtIn, 2);
    expect(bounce(0.8)).toBeGreaterThan(0.3);
    expect(bounce(null)).toBeLessThan(0.25);
  });
});
