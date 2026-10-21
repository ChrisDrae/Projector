import {
  BoxContainer,
  Drag,
  Layer,
  LineSet,
  Mesh,
  MeshNode,
  PerlinNoise,
  PerspectiveCamera,
  PointCloud,
  Random,
  Scene,
  VectorField,
  World,
  vec3,
} from "projector";
import { orbitCamera, type Scenario } from "../harness.js";

// Mirrors demos/flow-field/main.ts
const COUNT = 4000;
const BOX = 3;
const TRAIL = 0.05;
const E = 0.05;

export const flowField: Scenario = {
  name: "flow-field",
  create() {
    const world = new World({ gravity: { x: 0, y: 0, z: 0 }, iterations: 1, restitution: 1 });
    const box = world.addCollider(new BoxContainer({ size: BOX }));
    world.addForce(new Drag(1.5));

    const noise = new PerlinNoise("flow");
    const scale = 0.9;
    const evolve = 0.15;
    const potential = (k: number, x: number, y: number, z: number, w: number): number =>
      noise.noise3D(x * scale + k * 31.4, y * scale + w, z * scale - k * 17.3);
    world.addForce(
      new VectorField(
        (x, y, z, t, out) => {
          const w = t * evolve;
          const a1 = potential(0, x, y, z, w);
          const a2 = potential(1, x, y, z, w);
          const a3 = potential(2, x, y, z, w);
          const d1y = potential(0, x, y + E, z, w) - a1;
          const d1z = potential(0, x, y, z + E, w) - a1;
          const d2x = potential(1, x + E, y, z, w) - a2;
          const d2z = potential(1, x, y, z + E, w) - a2;
          const d3x = potential(2, x + E, y, z, w) - a3;
          const d3y = potential(2, x, y + E, z, w) - a3;
          out.x = (d3y - d2z) / E;
          out.y = (d1z - d3x) / E;
          out.z = (d2x - d1y) / E;
        },
        { mode: "acceleration", strength: 4 },
      ),
    );

    const rnd = new Random(2);
    const p = vec3.create();
    for (let i = 0; i < COUNT; i++) world.addBody({ position: rnd.inBox(p, { x: 0, y: 0, z: 0 }, BOX / 2 - 0.01) });

    const scene = new Scene({ background: "#1b1a1a" });
    const trails = new LineSet(COUNT, { color: "rgb(160, 212, 91)", opacity: 0.35, layer: Layer.Background });
    scene.add(trails);
    scene.add(new PointCloud(world.bodies, { color: "rgb(200, 236, 150)", size: 2, depthCue: 0.65 }));
    scene.add(new MeshNode(Mesh.box(BOX), { color: "#d618c6", wireframe: true, opacity: 0.5 }, box.transform));

    const camera = new PerspectiveCamera();
    orbitCamera(camera, { x: 0, y: 0, z: 0 }, 4.6, 0.5, -0.35);
    return {
      world,
      scene,
      camera,
      afterStep() {
        const s = world.bodies;
        const pos = s.pos;
        const vel = s.vel;
        for (let i = 0; i < s.count; i++) {
          const o = i * 3;
          trails.setSegment(
            i,
            pos[o],
            pos[o + 1],
            pos[o + 2],
            pos[o] - vel[o] * TRAIL,
            pos[o + 1] - vel[o + 1] * TRAIL,
            pos[o + 2] - vel[o + 2] * TRAIL,
          );
        }
        trails.count = s.count;
      },
    };
  },
};
