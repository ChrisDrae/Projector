import {
  AmbientLight,
  DirectionalLight,
  Ground,
  NBodyGravity,
  ParticleGroup,
  PointLight,
  Random,
  vec3,
  type BodyId,
  type Simulation,
  type SphereCloud,
} from "projector";
import type { DemoConfig } from "../shared/config.js";

const CORE_MASS = 10;
const G = 1;

export const config: DemoConfig = {
  title: "Gravitation",
  help: "Drag: orbit · Wheel: zoom\nBodies attract each other and merge into clumps when they collide.",
  background: "#1b1a1a",
  camera: { far: 200 },
  orbit: { button: 0, distance: 7, pitch: -0.55 },
  world: { gravity: { x: 0, y: 0, z: 0 }, restitution: 0.1, friction: 0.2, iterations: 4 },
};

export interface GravitationDemo {
  gravity: NBodyGravity;
  bodies: ParticleGroup;
  /** Adds a ring of light bodies on circular orbits between rMin and rMax. */
  addDisk(count: number, rMin: number, rMax: number): void;
  reset(): void;
  /** Off by default: bodies drawn as flat dots. On: lit by a light at the core, as shaded balls. */
  setLit(on: boolean): void;
}

function radiusFor(mass: number): number {
  return 0.02 * Math.cbrt(mass / 0.0006);
}

export function setup(sim: Simulation): GravitationDemo {
  const world = sim.world;
  const gravity = world.addForce(new NBodyGravity(G, 0.05));
  const store = world.bodies;
  const bodies = sim.add(
    new ParticleGroup({
      palette: ["#7fb6ff", "rgb(160, 212, 91)", "#ffd166", "#ff7b5c"],
      // Color by mass: light bodies blue, clumps green/yellow, the core orange
      colorIndex: (i) => {
        const m = store.mass[i];
        return m >= 1 ? 3 : m >= 0.006 ? 2 : m >= 0.0016 ? 1 : 0;
      },
      depthCue: 0.55,
      shadeLevels: 6,
      minPixelRadius: 0.8,
    }),
  );
  sim.add(new Ground({ y: -1.2, size: 8, divisions: 16, color: "#3a3737", opacity: 1, collider: false }));

  const rnd = new Random(7);
  const p = vec3.create();
  const v = vec3.create();
  let core: BodyId = -1;
  const star = new PointLight({ x: 0, y: 0, z: 0 }, { color: "#ffe2b0", intensity: 5, decay: 1 });
  const coreAt = vec3.create();
  sim.onUpdate(() => {
    if (core >= 0 && sim.world.bodies.has(core)) sim.world.getPosition(core, coreAt);
    star.position.x = coreAt.x;
    star.position.y = coreAt.y;
    star.position.z = coreAt.z;
  });

  const demo: GravitationDemo = {
    gravity,
    bodies,
    addDisk(count, rMin, rMax) {
      for (let i = 0; i < count; i++) {
        const r = rMin + (rMax - rMin) * Math.sqrt(rnd.next());
        const a = rnd.range(0, 2 * Math.PI);
        vec3.set(p, r * Math.cos(a), rnd.gaussian() * 0.03 * r, r * Math.sin(a));
        const speed = Math.sqrt((G * CORE_MASS) / r) * rnd.range(0.96, 1.04);
        vec3.set(v, -Math.sin(a) * speed, 0, Math.cos(a) * speed);
        const mass = 0.0002 * Math.exp(rnd.range(0, Math.log(12)));
        bodies.add({ position: p, velocity: v, mass, radius: radiusFor(mass) });
      }
    },
    reset() {
      bodies.clear();
      core = bodies.add({ position: { x: 0, y: 0, z: 0 }, mass: CORE_MASS, radius: 0.16 });
      demo.addDisk(700, 0.6, 3.2);
      cancelDrift(sim);
    },
    setLit(on) {
      const cloud = bodies.node as SphereCloud;
      cloud.shading = on ? "sprite" : "flat";
      sim.scene.ambient = new AmbientLight(on ? 0.06 : 0.3);
      sim.scene.lights = on ? [star] : [new DirectionalLight()];
    },
  };
  demo.reset();
  return demo;
}

/** Removes net momentum so the system doesn't drift out of view. */
function cancelDrift(sim: Simulation): void {
  const s = sim.world.bodies;
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
