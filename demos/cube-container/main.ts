import {
  BoxContainer,
  Layer,
  Mesh,
  MeshNode,
  PointerDrag,
  Random,
  SphereCloud,
  World,
  quat,
  vec3,
} from "projector";
import { createDemo } from "../shared/setup.js";

const RADIUS = 0.003;
const BOX_SIZE = 0.5;
const BOX_POSITION = { x: 0, y: 0.4, z: 0.2 };
/** Radians of spin per dragged pixel. */
const SPIN = 0.01;
const MOVE_SPEED = 1;

const demo = createDemo({
  title: "Cube container",
  help: "Left drag: spin the box · Arrows, PgUp/PgDn: move it\nRight drag: orbit · Wheel: zoom",
  background: "#333131",
  orbit: { button: 2, target: { x: 0, y: 0.3, z: 0.2 }, distance: 1.5, pitch: -0.3 },
});

const world = new World({ gravity: { x: 0, y: -9.8, z: 0 }, restitution: 0.3, friction: 0.05 });
const box = world.addCollider(
  new BoxContainer({ size: BOX_SIZE, position: { ...BOX_POSITION }, maxTransferSpeed: 6 }),
);

const rnd = new Random(1);
const local = vec3.create();
const spawnAt = vec3.create();
const ORIGIN = vec3.create();

function spawn(count: number): void {
  const h = box.halfExtents.x - RADIUS;
  for (let i = 0; i < count; i++) {
    rnd.inBox(local, ORIGIN, h);
    box.transform.toWorld(spawnAt, local);
    world.addBody({ position: spawnAt, radius: RADIUS, mass: 1 });
  }
}

function reset(): void {
  world.bodies.clear();
  Object.assign(box.transform.position, BOX_POSITION);
  quat.identity(box.transform.rotation);
  box.cacheAxes();
  vec3.set(box.angularVelocity, 0, 0, 0);
  spawn(1000);
}
reset();

const floor = demo.scene.add(new MeshNode(Mesh.grid(2, 16), { color: "#d618c6", opacity: 0.35 }));
floor.layer = Layer.Background;
// The cloud reads positions and radii straight from the physics arrays: no copying
demo.scene.add(new SphereCloud(world.bodies, { color: "rgb(160, 212, 91)" }));
// The mesh shares the container's transform, so it moves and spins with it
demo.scene.add(
  new MeshNode(Mesh.box(BOX_SIZE), { color: "#d618c6", wireframe: true, lineWidth: 2 }, box.transform),
);

const drag = { x: 0, y: 0 };
new PointerDrag(demo.canvas, (dx, dy) => {
  drag.x += dx;
  drag.y += dy;
});

let shake = 0;
const hud = demo.hud;
const buttons = hud.row();
hud.button("+1000 spheres", () => spawn(1000), buttons);
hud.button("Shake", () => (shake = 0.6), buttons);
hud.button("Reset", reset, buttons);
hud.slider("time scale", 0.1, 2, 0.05, world.timeScale, (v) => (world.timeScale = v));
hud.slider("restitution", 0, 1, 0.05, world.restitution, (v) => (world.restitution = v));

const right = vec3.create();
const up = vec3.create();
const forward = vec3.create();

demo.start((dt) => {
  demo.camera.getRight(right);
  demo.camera.getUp(up);
  demo.camera.getForward(forward);

  // Dragging spins the box around the camera's axes at the speed of the drag; released, the spin decays
  const w = box.angularVelocity;
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

  // Arrow keys move the box relative to the view, so it always goes the way you press
  const kb = demo.keyboard;
  const ax = kb.axis("ArrowLeft", "ArrowRight");
  const ay = kb.axis("ArrowDown", "ArrowUp");
  const az = kb.axis("PageDown", "PageUp");
  const v = box.linearVelocity;
  vec3.set(v, 0, 0, 0);
  vec3.scaleAndAdd(v, v, right, ax * MOVE_SPEED);
  vec3.scaleAndAdd(v, v, up, ay * MOVE_SPEED);
  vec3.scaleAndAdd(v, v, forward, az * MOVE_SPEED);
  if (shake > 0) {
    shake -= dt;
    vec3.scaleAndAdd(v, v, right, Math.sin(shake * 45) * 2.5);
  }

  world.step(dt);

  const s = world.stats;
  hud.stat("bodies", s.bodies);
  hud.stat("substeps", s.substeps);
  hud.stat("physics ms", s.stepMs);
  hud.stat("contact pairs", s.pairs);
  hud.stat("max bucket", world.broadphase.stats.maxBucket);
});
