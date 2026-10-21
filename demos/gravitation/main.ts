import { Layer, Mesh, MeshNode, NBodyGravity, Random, SphereCloud, World, kineticEnergy, vec3 } from "projector";
import { createDemo } from "../shared/setup.js";

const CORE_MASS = 10;
const G = 1;

const demo = createDemo({
  title: "Gravitation",
  help: "Drag: orbit · Wheel: zoom\nBodies attract each other and merge into clumps when they collide.",
  background: "#1b1a1a",
  far: 200,
  orbit: { button: 0, distance: 7, pitch: -0.55 },
});

const world = new World({ gravity: { x: 0, y: 0, z: 0 }, restitution: 0.1, friction: 0.2, iterations: 4 });
const gravity = world.addForce(new NBodyGravity(G, 0.05));
const rnd = new Random(7);
const p = vec3.create();
const v = vec3.create();

function radiusFor(mass: number): number {
  return 0.02 * Math.cbrt(mass / 0.0006);
}

/** A thin disk of light bodies on roughly circular orbits around a heavy core. */
function addDisk(count: number, rMin: number, rMax: number): void {
  for (let i = 0; i < count; i++) {
    const r = rMin + (rMax - rMin) * Math.sqrt(rnd.next());
    const a = rnd.range(0, 2 * Math.PI);
    vec3.set(p, r * Math.cos(a), rnd.gaussian() * 0.03 * r, r * Math.sin(a));
    const speed = Math.sqrt((G * CORE_MASS) / r) * rnd.range(0.96, 1.04);
    vec3.set(v, -Math.sin(a) * speed, 0, Math.cos(a) * speed);
    const mass = 0.0002 * Math.exp(rnd.range(0, Math.log(12)));
    world.addBody({ position: p, velocity: v, mass, radius: radiusFor(mass) });
  }
}

/** Removes net momentum so the system doesn't drift out of view. */
function cancelDrift(): void {
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
}

function reset(): void {
  world.bodies.clear();
  world.addBody({ position: { x: 0, y: 0, z: 0 }, mass: CORE_MASS, radius: 0.16 });
  addDisk(700, 0.6, 3.2);
  cancelDrift();
}
reset();

const palette = ["#7fb6ff", "rgb(160, 212, 91)", "#ffd166", "#ff7b5c"];
const masses = world.bodies;
demo.scene.add(
  new SphereCloud(world.bodies, {
    palette,
    // Color by mass: light bodies blue, clumps green/yellow, the core orange
    colorIndex: (i) => {
      const m = masses.mass[i];
      return m >= 1 ? 3 : m >= 0.006 ? 2 : m >= 0.0016 ? 1 : 0;
    },
    depthCue: 0.55,
    shadeLevels: 6,
    minPixelRadius: 0.8,
  }),
);
const grid = demo.scene.add(new MeshNode(Mesh.grid(8, 16), { color: "#3a3737" }));
grid.layer = Layer.Background;
grid.transform.position.y = -1.2;

const hud = demo.hud;
const row = hud.row();
hud.button("Reset", reset, row);
hud.button("+200 bodies", () => {
  addDisk(200, 3.4, 4.2);
}, row);
hud.slider("G", 0.2, 3, 0.1, gravity.G, (g) => (gravity.G = g));
hud.slider("time scale", 0.1, 2, 0.05, world.timeScale, (t) => (world.timeScale = t));

demo.start((dt) => {
  world.step(dt);
  const s = world.stats;
  hud.stat("bodies", s.bodies);
  hud.stat("physics ms", s.stepMs);
  hud.stat("contact pairs", s.pairs);
  hud.stat("kinetic energy", kineticEnergy(world.bodies));
});
