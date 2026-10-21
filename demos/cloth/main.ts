import {
  DirectionalLight,
  DistanceConstraintSet,
  Drag,
  Layer,
  Mesh,
  MeshNode,
  PerlinNoise,
  PlaneCollider,
  SphereCollider,
  Transform,
  VectorField,
  World,
  type BodyId,
} from "projector";
import { createDemo } from "../shared/setup.js";

const N = 30;
const SIZE = 1.2;
const SPACING = SIZE / (N - 1);
const TOP = 0.6;
const FLOOR = -0.75;
const BALL = { x: 0, y: -0.15, z: 0.4 };
const BALL_RADIUS = 0.25;

const demo = createDemo({
  title: "Cloth",
  help: "Drag: orbit · Wheel: zoom\nDistance constraints, Perlin noise wind, sphere and floor colliders.",
  background: "#333131",
  orbit: { button: 0, target: { x: 0, y: -0.05, z: 0.2 }, distance: 2.9, yaw: 2.6, pitch: -0.2 },
});

const world = new World({ iterations: 12, restitution: 0, friction: 0.5 });
world.addForce(new Drag(0.01));
world.addCollider(new PlaneCollider({ x: 0, y: 1, z: 0 }, FLOOR));
world.addCollider(new SphereCollider(BALL, BALL_RADIUS));

const noise = new PerlinNoise("wind");
let windStrength = 2.5;
const wind = world.addForce(
  new VectorField(
    (x, y, _z, t, out) => {
      const gust = noise.noise3D(x * 1.4, y * 1.4, t * 0.5);
      out.x = 0.6 * noise.noise3D(y * 2, t * 0.3, 7.1);
      out.y = 0.2 * gust;
      out.z = 2.5 * (0.6 + gust);
    },
    { mode: "acceleration", strength: windStrength },
  ),
);

let ids: BodyId[] = [];
let pins: BodyId[] = [];
let links = world.addConstraint(new DistanceConstraintSet(world.bodies));

function build(): void {
  world.bodies.clear();
  world.removeConstraint(links);
  links = world.addConstraint(new DistanceConstraintSet(world.bodies));
  ids = [];
  pins = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const pinned = j === 0 && (i % 4 === 0 || i === N - 1);
      // Radius only pads the colliders (no body-body collisions), so the cloth rests just above surfaces
      const id = world.addBody({
        position: { x: -SIZE / 2 + i * SPACING, y: TOP - j * SPACING, z: 0 },
        mass: 0.02,
        radius: 0.012,
        collides: false,
        isStatic: pinned,
      });
      ids.push(id);
      if (pinned) pins.push(id);
    }
  }
  const at = (i: number, j: number): BodyId => ids[j * N + i];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // Structural, shear and bending links
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
}
build();

// A softer fill light from the other side, so both sides of the cloth show their folds
demo.scene.lights.push(new DirectionalLight({ x: -0.5, y: -0.4, z: -1 }, 0.45));

// Vertex (i, j) of the plane mesh is index j * N + i, the same order the bodies were added in
const clothMesh = Mesh.plane(SIZE, SIZE, N - 1, N - 1);
demo.scene.add(new MeshNode(clothMesh, { color: "#e0a23a", side: "double" }));
demo.scene.add(new MeshNode(Mesh.sphere(BALL_RADIUS * 0.97, 20, 14), { color: "#d618c6" }, new Transform({ ...BALL })));
const floor = demo.scene.add(new MeshNode(Mesh.grid(3, 18), { color: "#d618c6", opacity: 0.35 }));
floor.layer = Layer.Background;
floor.transform.position.y = FLOOR;

const hud = demo.hud;
const row = hud.row();
hud.button("Release pins", () => {
  for (const id of pins) world.setStatic(id, false);
}, row);
hud.button("Reset", build, row);
hud.slider("wind", 0, 5, 0.1, windStrength, (w) => {
  windStrength = w;
  wind.strength = w;
});

demo.start((dt) => {
  world.step(dt);
  clothMesh.positions.set(world.bodies.pos.subarray(0, N * N * 3));
  clothMesh.markDirty();
  hud.stat("particles", world.bodies.count);
  hud.stat("constraints", links.count);
  hud.stat("physics ms", world.stats.stepMs);
});
