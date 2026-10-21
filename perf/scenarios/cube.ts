import {
  BoxContainer,
  Layer,
  Mesh,
  MeshNode,
  PerspectiveCamera,
  Random,
  Scene,
  SphereCloud,
  World,
  vec3,
  type BroadphaseMode,
} from "projector";
import { orbitCamera, type Scenario, type ScenarioInstance } from "../harness.js";

// Mirrors demos/cube-container/main.ts
const RADIUS = 0.003;
const BOX_SIZE = 0.5;
const BOX_POSITION = { x: 0, y: 0.4, z: 0.2 };
const SPIN = 0.01;
const MOVE_SPEED = 1;

interface CubeOptions {
  /** Bodies dropped on a single point at the start ("Pile 2000"). */
  pile?: number;
  mode?: BroadphaseMode;
}

function createCube(options: CubeOptions): ScenarioInstance {
  const world = new World({ gravity: { x: 0, y: -9.8, z: 0 }, restitution: 0.3, friction: 0.05 });
  if (options.mode) world.broadphase.mode = options.mode;
  const box = world.addCollider(
    new BoxContainer({ size: BOX_SIZE, position: { ...BOX_POSITION }, maxTransferSpeed: 6 }),
  );

  const rnd = new Random(1);
  const local = vec3.create();
  const spawnAt = vec3.create();
  const origin = vec3.create();
  const h = box.halfExtents.x - RADIUS;
  for (let i = 0; i < 1000; i++) {
    rnd.inBox(local, origin, h);
    box.transform.toWorld(spawnAt, local);
    world.addBody({ position: spawnAt, radius: RADIUS, mass: 1 });
  }
  for (let i = 0; i < (options.pile ?? 0); i++) {
    world.addBody({ position: box.transform.position, radius: RADIUS, mass: 1 });
  }

  const scene = new Scene({ background: "#333131" });
  const floor = scene.add(new MeshNode(Mesh.grid(2, 16), { color: "#d618c6", opacity: 0.35 }));
  floor.layer = Layer.Background;
  scene.add(new SphereCloud(world.bodies, { color: "rgb(160, 212, 91)" }));
  scene.add(new MeshNode(Mesh.box(BOX_SIZE), { color: "#d618c6", wireframe: true, lineWidth: 2 }, box.transform));

  const camera = new PerspectiveCamera();
  orbitCamera(camera, { x: 0, y: 0.3, z: 0.2 }, 1.5, 0, -0.3);
  const right = vec3.create();
  const up = vec3.create();
  const forward = vec3.create();
  let shake = 0;
  let shaken = false;

  return {
    world,
    scene,
    camera,
    update(dt, time) {
      // Scripted input: drag the box into a spin, move it with the arrow keys, then shake it
      const dragX = time >= 0.5 && time < 1.5 ? 6 : 0;
      const dragY = time >= 0.5 && time < 1.5 ? 2 : 0;
      const ax = time >= 3 && time < 3.5 ? 1 : time >= 3.5 && time < 4 ? -1 : 0;
      const ay = time >= 4 && time < 4.5 ? 1 : time >= 4.5 && time < 5 ? -1 : 0;
      if (time >= 6 && !shaken) {
        shake = 0.6;
        shaken = true;
      }

      camera.getRight(right);
      camera.getUp(up);
      camera.getForward(forward);
      const w = box.angularVelocity;
      if (dragX !== 0 || dragY !== 0) {
        const k = SPIN / Math.max(dt, 1e-3);
        w.x = -(up.x * dragX + right.x * dragY) * k;
        w.y = -(up.y * dragX + right.y * dragY) * k;
        w.z = -(up.z * dragX + right.z * dragY) * k;
      } else {
        vec3.scale(w, w, Math.exp(-4 * dt));
      }
      const v = box.linearVelocity;
      vec3.set(v, 0, 0, 0);
      vec3.scaleAndAdd(v, v, right, ax * MOVE_SPEED);
      vec3.scaleAndAdd(v, v, up, ay * MOVE_SPEED);
      if (shake > 0) {
        shake -= dt;
        vec3.scaleAndAdd(v, v, right, Math.sin(shake * 45) * 2.5);
      }
    },
  };
}

export const cubeContainer: Scenario = { name: "cube-container", create: () => createCube({}) };
export const cubePileAccurate: Scenario = {
  name: "cube-pile-accurate",
  create: () => createCube({ pile: 2000, mode: "accurate" }),
};
export const cubePileSandbox: Scenario = {
  name: "cube-pile-sandbox",
  create: () => createCube({ pile: 2000, mode: "sandbox" }),
};
