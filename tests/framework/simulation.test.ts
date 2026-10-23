import { describe, expect, it } from "vitest";
import { Cloth } from "../../src/framework/objects/cloth.js";
import { Container } from "../../src/framework/objects/container.js";
import { Ground } from "../../src/framework/objects/ground.js";
import { ParticleGroup } from "../../src/framework/objects/particleGroup.js";
import { StaticSphere } from "../../src/framework/objects/staticSphere.js";
import { VelocityTrails } from "../../src/framework/objects/velocityTrails.js";
import { SimObject } from "../../src/framework/simObject.js";
import { Simulation } from "../../src/framework/simulation.js";
import { Drag } from "../../src/physics/forces.js";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { PrimitiveKind } from "../../src/rendering/software/renderQueue.js";
import { Mesh } from "../../src/scene/mesh.js";
import { MeshNode } from "../../src/scene/nodes.js";
import { Random } from "../../src/utility/random.js";

function emitted(sim: Simulation, kind: number): number {
  const e = new SoftwareEmitter();
  e.emitScene(sim.scene, sim.camera, 800, 800);
  let n = 0;
  for (let i = 0; i < e.queue.count; i++) if (e.queue.kind[i] === kind) n++;
  return n;
}

describe("Simulation", () => {
  it("runs headless: updates, fixed steps, sync and listeners in order", () => {
    const sim = new Simulation({ orbit: { distance: 2 } });
    const calls: string[] = [];
    class Probe extends SimObject {
      override update(): void {
        calls.push("update");
      }
      override fixedUpdate(): void {
        calls.push("fixed");
      }
      override sync(): void {
        calls.push("sync");
      }
    }
    sim.add(new Probe());
    sim.onUpdate(() => calls.push("onUpdate"));
    sim.onFixedUpdate(() => calls.push("onFixed"));
    sim.onAfterRender(() => calls.push("render"));
    sim.frame(1 / 60);
    expect(calls).toEqual(["onUpdate", "update", "onFixed", "fixed", "onFixed", "fixed", "sync", "render"]);
    expect(sim.stats.substeps).toBe(2);
    // The orbit option places the camera even without a canvas
    expect(Math.hypot(sim.camera.position.x, sim.camera.position.y, sim.camera.position.z)).toBeCloseTo(2);
  });

  it("does not advance physics while paused", () => {
    const sim = new Simulation();
    const group = sim.add(new ParticleGroup({ radius: 0.1 }));
    const id = group.add({ position: { x: 0, y: 1, z: 0 } });
    sim.paused = true;
    sim.frame(0.1);
    expect(sim.world.getPosition(id, { x: 0, y: 0, z: 0 }).y).toBe(1);
    sim.paused = false;
    sim.frame(0.1);
    expect(sim.world.getPosition(id, { x: 0, y: 0, z: 0 }).y).toBeLessThan(1);
  });

  it("removing an object removes everything it owns", () => {
    const sim = new Simulation();
    const box = sim.add(new Container({ size: 1 }));
    const ground = sim.add(new Ground());
    const ball = sim.add(new StaticSphere({ center: { x: 0, y: 0, z: 0 }, radius: 0.5 }));
    const balls = sim.add(new ParticleGroup({ radius: 0.01 }));
    balls.spawn(50, (_, p) => box.randomPoint(new Random(1), p, 0.01));
    const cloth = sim.add(new Cloth({ width: 1, height: 1, columns: 5, rows: 5 }));
    class WithForce extends SimObject {
      constructor() {
        super();
        this.addForce(new Drag(0.1));
      }
    }
    const dragged = sim.add(new WithForce());
    expect(sim.world.colliders.length).toBe(3);
    expect(sim.world.forces.length).toBe(1);
    expect(sim.world.constraints.length).toBe(1);
    expect(sim.world.bodies.count).toBe(75);
    expect(sim.scene.nodes.length).toBe(5);

    for (const o of [box, ground, ball, balls, cloth, dragged]) sim.remove(o);
    expect(sim.world.colliders.length).toBe(0);
    expect(sim.world.forces.length).toBe(0);
    expect(sim.world.constraints.length).toBe(0);
    expect(sim.world.bodies.count).toBe(0);
    expect(sim.scene.nodes.length).toBe(0);

    // Constructor-time resources come back when re-added; onAttach ones are recreated, not duplicated
    sim.add(cloth);
    sim.add(dragged);
    expect(sim.world.constraints.length).toBe(1);
    expect(sim.world.forces.length).toBe(1);
    expect(sim.world.bodies.count).toBe(25);
    expect(sim.scene.nodes.length).toBe(1);
  });

  it("composes transforms down the object tree and hides children with their parent", () => {
    const sim = new Simulation({ camera: { position: { x: 0, y: 0, z: -5 } } });
    const parent = sim.add(new SimObject());
    const child = parent.addChild(new SimObject());
    const node = child.addNode(new MeshNode(Mesh.box(0.1)));
    parent.transform.position.x = 1;
    parent.transform.rotateWorld(0, Math.PI / 2, 0);
    child.transform.position.x = 2;
    sim.frame(0);
    // Rotating the parent a quarter turn around y carries the child's +x offset onto the z axis
    expect(child.worldMatrix[12]).toBeCloseTo(1);
    expect(Math.abs(child.worldMatrix[14])).toBeCloseTo(2);
    expect(node.parentMatrix).toBe(child.worldMatrix);

    parent.visible = false;
    sim.frame(0);
    expect(node.visible).toBe(false);
    parent.visible = true;
    sim.frame(0);
    expect(node.visible).toBe(true);
  });
});

describe("ParticleGroup", () => {
  it("draws only its own bodies when it shares the store", () => {
    const sim = new Simulation({ camera: { position: { x: 0, y: 0, z: -3 } } });
    const a = sim.add(new ParticleGroup({ radius: 0.02, color: "#f00" }));
    const b = sim.add(new ParticleGroup({ radius: 0.02, color: "#00f" }));
    a.spawn(30, (i, p) => {
      p.x = (i % 6) * 0.1 - 0.3;
      p.y = Math.floor(i / 6) * 0.1 - 0.2;
    });
    b.spawn(12, (i, p) => {
      p.x = (i % 4) * 0.1 - 0.2;
      p.z = 0.5;
    });
    sim.paused = true;
    sim.frame(0);
    expect(a.count).toBe(30);
    expect(b.count).toBe(12);
    expect(emitted(sim, PrimitiveKind.Circle)).toBe(42);
    b.visible = false;
    sim.frame(0);
    expect(emitted(sim, PrimitiveKind.Circle)).toBe(30);

    b.remove(b.idAt(0));
    a.clear();
    expect(sim.world.bodies.count).toBe(11);
    expect(b.count).toBe(11);
  });

  it("keeps groups apart when they don't collide", () => {
    const sim = new Simulation({ world: { gravity: { x: 0, y: 0, z: 0 } } });
    const a = sim.add(new ParticleGroup({ radius: 0.1 }));
    const b = sim.add(new ParticleGroup({ radius: 0.1 }));
    a.add({ position: { x: 0, y: 0, z: 0 } });
    a.add({ position: { x: 0.15, y: 0, z: 0 } });
    b.add({ position: { x: 0, y: 0.05, z: 0 } });
    sim.world.setCollision(a.group, b.group, false);
    sim.world.stepFixed(1 / 120);
    // Only the pair inside group a remains
    expect(sim.world.broadphase.pairCount).toBe(1);
    sim.world.setCollision(a.group, b.group, true);
    expect(sim.world.broadphase.collisionMask).toBeNull();
    sim.world.stepFixed(1 / 120);
    expect(sim.world.broadphase.pairCount).toBe(3);
  });
});

describe("built-in objects", () => {
  it("cloth meshes follow their particles and fall when released", () => {
    const sim = new Simulation();
    const cloth = sim.add(new Cloth({ width: 1, height: 1, columns: 4, rows: 4, top: { x: 0, y: 1, z: 0 } }));
    sim.frame(0.2);
    const bodies = sim.world.bodies;
    const k = 15;
    const i = bodies.indexOf(cloth.ids[k]);
    expect(cloth.mesh.positions[k * 3 + 1]).toBe(bodies.pos[i * 3 + 1]);
    const pinnedY = cloth.mesh.positions[1];
    expect(pinnedY).toBeCloseTo(1);
    cloth.release();
    sim.frame(0.2);
    expect(cloth.mesh.positions[1]).toBeLessThan(pinnedY);
    cloth.reset();
    expect(sim.world.bodies.count).toBe(16);
    expect(sim.world.constraints.length).toBe(1);
  });

  it("velocity trails draw one streak per particle", () => {
    const sim = new Simulation({ world: { gravity: { x: 0, y: -1, z: 0 } }, camera: { position: { x: 0, y: 0, z: -3 } } });
    const group = sim.add(new ParticleGroup({ radius: 0, render: "none" }));
    sim.add(new VelocityTrails(group));
    group.spawn(300, (i, p, v) => {
      p.x = (i % 20) * 0.02;
      v.y = 1;
    });
    sim.frame(1 / 60);
    expect(emitted(sim, PrimitiveKind.Line)).toBe(300);
  });

  it("the ground's plane holds bodies up and follows the object", () => {
    const sim = new Simulation();
    const ground = sim.add(new Ground({ y: -1 }));
    const group = sim.add(new ParticleGroup({ radius: 0.05 }));
    const id = group.add({ position: { x: 0, y: 0, z: 0 } });
    for (let f = 0; f < 120; f++) sim.frame(1 / 60);
    expect(sim.world.getPosition(id, { x: 0, y: 0, z: 0 }).y).toBeCloseTo(-0.95, 2);
    ground.transform.position.y = -2;
    for (let f = 0; f < 120; f++) sim.frame(1 / 60);
    expect(sim.world.getPosition(id, { x: 0, y: 0, z: 0 }).y).toBeCloseTo(-1.95, 2);
  });
});

describe("picking", () => {
  it("casts screen rays into the world", () => {
    const sim = new Simulation({ camera: { position: { x: 0, y: 0, z: -3 } } });
    sim.add(new Ground({ y: -1 }));
    const group = sim.add(new ParticleGroup({ radius: 0.2 }));
    const near = group.add({ position: { x: 0, y: 0, z: 0 } });
    group.add({ position: { x: 0, y: 0, z: 1 } });
    const origin = { x: 0, y: 0, z: 0 };
    const dir = { x: 0, y: 0, z: 0 };

    sim.camera.screenToRay(400, 400, 800, 800, origin, dir);
    expect(dir.z).toBeCloseTo(1);
    const hit = sim.world.raycast(origin, dir)!;
    expect(hit.body).toBe(near);
    expect(hit.distance).toBeCloseTo(2.8);
    expect(hit.normal.z).toBeCloseTo(-1);

    // Toward the bottom of the screen the ray hits the floor
    sim.camera.screenToRay(400, 790, 800, 800, origin, dir);
    const floor = sim.world.raycast(origin, dir)!;
    expect(floor.body).toBe(-1);
    expect(floor.collider).toBe(sim.world.colliders[0]);
    expect(floor.point.y).toBeCloseTo(-1);
    expect(floor.normal.y).toBe(1);

    // Pointing up there's nothing
    sim.camera.screenToRay(400, 0, 800, 800, origin, dir);
    expect(sim.world.raycast(origin, dir)).toBeNull();
  });
});

describe("rigid objects", () => {
  it("create their body, follow it every frame and remove it with themselves", async () => {
    const { RigidBox, RigidCapsule, RigidSphere } = await import("../../src/framework/objects/rigidObject.js");
    const sim = new Simulation();
    sim.add(new Ground());
    const box = sim.add(new RigidBox(0.4, { position: { x: 0, y: 1, z: 0 } }));
    const ball = sim.add(new RigidSphere(0.2, { position: { x: 1, y: 2, z: 0 } }));
    // Slightly tilted, so it can't balance on its end
    const tilt = [0, 0, Math.sin(0.15), Math.cos(0.15)];
    const capsule = sim.add(new RigidCapsule(0.1, 0.3, { position: { x: -1, y: 1, z: 0 }, rotation: tilt }));
    expect(sim.world.rigid.count).toBe(3);
    for (let f = 0; f < 240; f++) sim.frame(1 / 60);
    expect(box.transform.position.y).toBeCloseTo(0.2, 2);
    expect(ball.transform.position.y).toBeCloseTo(0.2, 2);
    // The capsule tipped over and lies on its side
    expect(capsule.transform.position.y).toBeCloseTo(0.1, 2);
    expect(box.node.parentMatrix).toBe(box.worldMatrix);
    expect(box.worldMatrix[13]).toBeCloseTo(0.2, 2);
    sim.remove(ball);
    expect(sim.world.rigid.count).toBe(2);
    expect(ball.id).toBe(-1);
  });

  it("are found by picking rays with the right surface normal", async () => {
    const { RigidBox, RigidCapsule } = await import("../../src/framework/objects/rigidObject.js");
    const sim = new Simulation({ world: { gravity: { x: 0, y: 0, z: 0 } } });
    const box = sim.add(new RigidBox(1, { position: { x: 0, y: 0, z: 2 } }));
    const capsule = sim.add(new RigidCapsule(0.25, 0.5, { position: { x: 3, y: 0, z: 2 } }));
    sim.frame(0);
    const hit = sim.world.raycast({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 })!;
    expect(hit.rigid).toBe(box.id);
    expect(hit.distance).toBeCloseTo(6.5);
    expect(hit.normal.z).toBeCloseTo(-1);
    // From above onto the capsule's top cap
    const top = sim.world.raycast({ x: 3, y: 5, z: 2 }, { x: 0, y: -1, z: 0 })!;
    expect(top.rigid).toBe(capsule.id);
    expect(top.point.y).toBeCloseTo(0.75);
    expect(top.normal.y).toBeCloseTo(1);
    // Its side
    const side = sim.world.raycast({ x: 6, y: 0.2, z: 2 }, { x: -1, y: 0, z: 0 })!;
    expect(side.point.x).toBeCloseTo(3.25);
    expect(side.normal.x).toBeCloseTo(1);
  });
});
