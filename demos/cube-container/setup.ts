import { Container, Ground, ParticleGroup, Random, quat, vec3, type Simulation, type Vec3 } from "projector";
import type { DemoConfig } from "../shared/config.js";

const RADIUS = 0.003;
const BOX_SIZE = 0.5;
const BOX_POSITION = { x: 0, y: 0.4, z: 0.2 };
/** Radians of spin per dragged pixel. */
const SPIN = 0.01;
const MOVE_SPEED = 1;

export const config: DemoConfig = {
  title: "Cube container",
  help: "Left drag: spin the box · Arrows, PgUp/PgDn: move it\nRight drag: orbit · Wheel: zoom",
  background: "#333131",
  orbit: { button: 2, target: { x: 0, y: 0.3, z: 0.2 }, distance: 1.5, pitch: -0.3 },
  world: { gravity: { x: 0, y: -9.8, z: 0 }, restitution: 0.3, friction: 0.05 },
};

export interface CubeDemo {
  box: Container;
  balls: ParticleGroup;
  /** Pointer movement since the last frame, in pixels: spins the box at the speed of the drag. */
  drag: { x: number; y: number };
  /** Movement in camera space (-1..1 per axis), added to the arrow keys. */
  move: Vec3;
  spawn(count: number): void;
  /** Drops bodies all on one point: the worst case for a grid broadphase (issue #1). */
  pile(count: number): void;
  shake(): void;
  reset(): void;
}

/** The demo's content, DOM-free: the page and the benchmarks both run exactly this. */
export function setup(sim: Simulation): CubeDemo {
  const box = new Container({
    size: BOX_SIZE,
    position: { ...BOX_POSITION },
    maxTransferSpeed: 6,
    material: { lineWidth: 2 },
  });
  sim.add(new Ground({ size: 2, divisions: 16, collider: false }));
  const balls = sim.add(new ParticleGroup({ radius: RADIUS, mass: 1, color: "rgb(160, 212, 91)" }));
  sim.add(box);

  const rnd = new Random(1);
  let shake = 0;
  const demo: CubeDemo = {
    box,
    balls,
    drag: { x: 0, y: 0 },
    move: { x: 0, y: 0, z: 0 },
    spawn(count) {
      balls.spawn(count, (_, p) => box.randomPoint(rnd, p, RADIUS));
    },
    pile(count) {
      balls.spawn(count, (_, p) => vec3.copy(p, box.transform.position));
    },
    shake() {
      shake = 0.6;
    },
    reset() {
      balls.clear();
      box.setPose(BOX_POSITION, quat.create());
      vec3.set(box.angularVelocity, 0, 0, 0);
      demo.spawn(1000);
    },
  };
  demo.reset();

  const right = vec3.create();
  const up = vec3.create();
  const forward = vec3.create();
  sim.onUpdate((dt) => {
    sim.camera.getRight(right);
    sim.camera.getUp(up);
    sim.camera.getForward(forward);

    // Dragging spins the box around the camera's axes at the speed of the drag; released, the spin decays
    const w = box.angularVelocity;
    const drag = demo.drag;
    if (drag.x !== 0 || drag.y !== 0) {
      const k = SPIN / Math.max(dt, 1e-3);
      w.x = -(up.x * drag.x + right.x * drag.y) * k;
      w.y = -(up.y * drag.x + right.y * drag.y) * k;
      w.z = -(up.z * drag.x + right.z * drag.y) * k;
      drag.x = 0;
      drag.y = 0;
    } else {
      vec3.scale(w, w, Math.exp(-4 * dt));
    }

    // Movement is relative to the view, so the box always goes the way you press
    const kb = sim.keyboard;
    const ax = demo.move.x + (kb ? kb.axis("ArrowLeft", "ArrowRight") : 0);
    const ay = demo.move.y + (kb ? kb.axis("ArrowDown", "ArrowUp") : 0);
    const az = demo.move.z + (kb ? kb.axis("PageDown", "PageUp") : 0);
    const v = box.linearVelocity;
    vec3.set(v, 0, 0, 0);
    vec3.scaleAndAdd(v, v, right, ax * MOVE_SPEED);
    vec3.scaleAndAdd(v, v, up, ay * MOVE_SPEED);
    vec3.scaleAndAdd(v, v, forward, az * MOVE_SPEED);
    if (shake > 0) {
      shake -= dt;
      vec3.scaleAndAdd(v, v, right, Math.sin(shake * 45) * 2.5);
    }
  });
  return demo;
}
