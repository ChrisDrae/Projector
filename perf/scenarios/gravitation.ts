import { Layer, Mesh, MeshNode, NBodyGravity, PerspectiveCamera, Random, Scene, SphereCloud, World, vec3 } from "projector";
import { orbitCamera, type Scenario } from "../harness.js";

// Mirrors demos/gravitation/main.ts
const CORE_MASS = 10;
const G = 1;

export const gravitation: Scenario = {
  name: "gravitation",
  create() {
    const world = new World({ gravity: { x: 0, y: 0, z: 0 }, restitution: 0.1, friction: 0.2, iterations: 4 });
    world.addForce(new NBodyGravity(G, 0.05));
    const rnd = new Random(7);
    const p = vec3.create();
    const v = vec3.create();

    world.addBody({ position: { x: 0, y: 0, z: 0 }, mass: CORE_MASS, radius: 0.16 });
    for (let i = 0; i < 700; i++) {
      const r = 0.6 + (3.2 - 0.6) * Math.sqrt(rnd.next());
      const a = rnd.range(0, 2 * Math.PI);
      vec3.set(p, r * Math.cos(a), rnd.gaussian() * 0.03 * r, r * Math.sin(a));
      const speed = Math.sqrt((G * CORE_MASS) / r) * rnd.range(0.96, 1.04);
      vec3.set(v, -Math.sin(a) * speed, 0, Math.cos(a) * speed);
      const mass = 0.0002 * Math.exp(rnd.range(0, Math.log(12)));
      world.addBody({ position: p, velocity: v, mass, radius: 0.02 * Math.cbrt(mass / 0.0006) });
    }
    const s = world.bodies;
    const total = vec3.create();
    let mass = 0;
    for (let i = 0; i < s.count; i++) {
      total.x += s.mass[i] * s.vel[i * 3];
      total.y += s.mass[i] * s.vel[i * 3 + 1];
      total.z += s.mass[i] * s.vel[i * 3 + 2];
      mass += s.mass[i];
    }
    for (let i = 0; i < s.count; i++) {
      s.vel[i * 3] -= total.x / mass;
      s.vel[i * 3 + 1] -= total.y / mass;
      s.vel[i * 3 + 2] -= total.z / mass;
    }

    const scene = new Scene({ background: "#1b1a1a" });
    scene.add(
      new SphereCloud(world.bodies, {
        palette: ["#7fb6ff", "rgb(160, 212, 91)", "#ffd166", "#ff7b5c"],
        colorIndex: (i) => {
          const m = s.mass[i];
          return m >= 1 ? 3 : m >= 0.006 ? 2 : m >= 0.0016 ? 1 : 0;
        },
        depthCue: 0.55,
        shadeLevels: 6,
        minPixelRadius: 0.8,
      }),
    );
    const grid = scene.add(new MeshNode(Mesh.grid(8, 16), { color: "#3a3737" }));
    grid.layer = Layer.Background;
    grid.transform.position.y = -1.2;

    const camera = new PerspectiveCamera({ far: 200 });
    orbitCamera(camera, { x: 0, y: 0, z: 0 }, 7, 0, -0.55);
    return { world, scene, camera };
  },
};
