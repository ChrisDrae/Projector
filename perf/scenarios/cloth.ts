import {
  DirectionalLight,
  DistanceConstraintSet,
  Drag,
  Layer,
  Mesh,
  MeshNode,
  PerlinNoise,
  PerspectiveCamera,
  PlaneCollider,
  Scene,
  SphereCollider,
  Transform,
  VectorField,
  World,
  type BodyId,
} from "projector";
import { orbitCamera, type Scenario } from "../harness.js";

// Mirrors demos/cloth/main.ts
const N = 30;
const SIZE = 1.2;
const SPACING = SIZE / (N - 1);
const TOP = 0.6;
const FLOOR = -0.75;
const BALL = { x: 0, y: -0.15, z: 0.4 };
const BALL_RADIUS = 0.25;

export const cloth: Scenario = {
  name: "cloth",
  create() {
    const world = new World({ iterations: 12, restitution: 0, friction: 0.5 });
    world.addForce(new Drag(0.01));
    world.addCollider(new PlaneCollider({ x: 0, y: 1, z: 0 }, FLOOR));
    world.addCollider(new SphereCollider(BALL, BALL_RADIUS));
    const noise = new PerlinNoise("wind");
    world.addForce(
      new VectorField(
        (x, y, _z, t, out) => {
          const gust = noise.noise3D(x * 1.4, y * 1.4, t * 0.5);
          out.x = 0.6 * noise.noise3D(y * 2, t * 0.3, 7.1);
          out.y = 0.2 * gust;
          out.z = 2.5 * (0.6 + gust);
        },
        { mode: "acceleration", strength: 2.5 },
      ),
    );

    const links = world.addConstraint(new DistanceConstraintSet(world.bodies));
    const ids: BodyId[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const pinned = j === 0 && (i % 4 === 0 || i === N - 1);
        ids.push(
          world.addBody({
            position: { x: -SIZE / 2 + i * SPACING, y: TOP - j * SPACING, z: 0 },
            mass: 0.02,
            radius: 0.012,
            collides: false,
            isStatic: pinned,
          }),
        );
      }
    }
    const at = (i: number, j: number): BodyId => ids[j * N + i];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (i + 1 < N) links.add(at(i, j), at(i + 1, j));
        if (j + 1 < N) links.add(at(i, j), at(i, j + 1));
        if (i + 1 < N && j + 1 < N) {
          links.add(at(i, j), at(i + 1, j + 1));
          links.add(at(i + 1, j), at(i, j + 1));
        }
        if (i + 2 < N) links.add(at(i, j), at(i + 2, j));
        if (j + 2 < N) links.add(at(i, j), at(i, j + 2));
      }
    }

    const scene = new Scene({ background: "#333131" });
    scene.lights.push(new DirectionalLight({ x: -0.5, y: -0.4, z: -1 }, 0.45));
    const clothMesh = Mesh.plane(SIZE, SIZE, N - 1, N - 1);
    scene.add(new MeshNode(clothMesh, { color: "#e0a23a", side: "double" }));
    scene.add(new MeshNode(Mesh.sphere(BALL_RADIUS * 0.97, 20, 14), { color: "#d618c6" }, new Transform({ ...BALL })));
    const floor = scene.add(new MeshNode(Mesh.grid(3, 18), { color: "#d618c6", opacity: 0.35 }));
    floor.layer = Layer.Background;
    floor.transform.position.y = FLOOR;

    const camera = new PerspectiveCamera();
    orbitCamera(camera, { x: 0, y: -0.05, z: 0.2 }, 2.9, 2.6, -0.2);
    return {
      world,
      scene,
      camera,
      afterStep() {
        clothMesh.positions.set(world.bodies.pos.subarray(0, N * N * 3));
        clothMesh.markDirty();
      },
    };
  },
};
