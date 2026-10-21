import {
  AmbientLight,
  DirectionalLight,
  Ground,
  HemisphereLight,
  ParticleGroup,
  PointLight,
  Random,
  RigidBox,
  RigidCapsule,
  RigidSphere,
  quat,
  type RigidObject,
  type Simulation,
  type Vec3,
} from "projector";
import type { DemoConfig } from "../shared/config.js";

const BOX = 0.4;
const MAX_SHOTS = 60;

export const config: DemoConfig = {
  title: "Rigid bodies",
  help: "Click: shoot · Right drag: orbit · Wheel: zoom\nBoxes, capsules and balls with friction, stacking\nand sleeping; particles collide with them too.",
  background: "#1d2026",
  orbit: { button: 2, target: { x: 0, y: 0.5, z: 0 }, distance: 4.8, yaw: 0.45, pitch: -0.32 },
  world: { restitution: 0.1, friction: 0.6, iterations: 10 },
};

export type ShotKind = "sphere" | "box" | "capsule";

export interface RigidDemo {
  bodies: RigidObject[];
  particles: ParticleGroup;
  reset(): void;
  /** Drops `count` random shapes from above. */
  drop(count: number): void;
  /** Throws a body from `origin` along the unit direction. */
  shoot(origin: Vec3, dir: Vec3, kind: ShotKind): void;
  /** Pours small particles over the pile. */
  pour(count: number): void;
}

export function setup(sim: Simulation): RigidDemo {
  const scene = sim.scene;
  scene.ambient = new AmbientLight(0.12);
  scene.lights = [
    new HemisphereLight("#9db4ff", "#3b3127", 0.35),
    new DirectionalLight({ x: -0.5, y: -1, z: 0.35 }, 0.7, { castShadow: true }),
    new PointLight({ x: 2.5, y: 2.5, z: -2 }, { color: "#ffb26b", intensity: 3, distance: 9 }),
  ];
  scene.shadow = { color: "#000000", opacity: 0.38 };
  sim.add(
    new Ground({
      style: "plane",
      size: 12,
      divisions: 14,
      color: "#4b4f58",
      opacity: 1,
      material: { shading: "smooth" },
    }),
  );
  const particles = sim.add(
    new ParticleGroup({ radius: 0.05, mass: 0.05, palette: ["#f1eeee", "#a0d45b"], colorIndex: (i) => i % 2, shading: "lit" }),
  );

  const rnd = new Random(11);
  const bodies: RigidObject[] = [];
  const shots: RigidObject[] = [];
  const add = <T extends RigidObject>(body: T): T => {
    bodies.push(body);
    return sim.add(body);
  };
  const rotation = quat.create();

  function build(): void {
    // A pyramid of boxes
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 5 - row; k++) {
        const x = (k - (4 - row) / 2) * (BOX + 0.01);
        add(new RigidBox(BOX, { position: { x, y: BOX / 2 + row * (BOX + 0.002), z: 0 }, mass: 1 }));
      }
    }
    // Capsules lying in front, a few balls behind
    for (let k = 0; k < 3; k++) {
      quat.setAxisAngle(rotation, { x: 0, y: 0, z: 1 }, Math.PI / 2);
      add(new RigidCapsule(0.13, 0.32, { position: { x: -0.9 + k * 0.9, y: 0.13, z: 1.1 }, rotation, mass: 1, material: { color: "#d618c6", shading: "smooth", specular: 0.4 } }));
    }
    for (let k = 0; k < 4; k++) {
      add(new RigidSphere(0.18, { position: { x: -1.2 + k * 0.8, y: 0.18, z: -1.2 }, mass: 1 }));
    }
  }

  const demo: RigidDemo = {
    bodies,
    particles,
    reset() {
      for (const b of bodies) sim.remove(b);
      bodies.length = 0;
      shots.length = 0;
      particles.clear();
      build();
    },
    drop(count) {
      for (let k = 0; k < count; k++) {
        quat.fromEuler(rotation, rnd.range(0, 3), rnd.range(0, 3), rnd.range(0, 3));
        const position = { x: rnd.range(-1.5, 1.5), y: rnd.range(3, 5), z: rnd.range(-1, 1) };
        const kind = k % 3;
        if (kind === 0) add(new RigidBox(rnd.range(0.25, 0.45), { position, rotation }));
        else if (kind === 1) add(new RigidCapsule(0.12, 0.25, { position, rotation, material: { color: "#d618c6", shading: "smooth", specular: 0.4 } }));
        else add(new RigidSphere(rnd.range(0.12, 0.22), { position }));
      }
    },
    shoot(origin, dir, kind) {
      const speed = 14;
      const position = { x: origin.x + dir.x * 0.6, y: origin.y + dir.y * 0.6, z: origin.z + dir.z * 0.6 };
      const velocity = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
      const material = { color: "#f1eeee", shading: "smooth" as const, specular: 0.5 };
      const body =
        kind === "box"
          ? new RigidBox(0.3, { position, velocity, mass: 2, material: { color: "#f1eeee", specular: 0.3 } })
          : kind === "capsule"
            ? new RigidCapsule(0.1, 0.2, { position, velocity, mass: 2, material })
            : new RigidSphere(0.15, { position, velocity, mass: 2, material });
      shots.push(add(body));
      // Keep the scene bounded: the oldest shots go away
      if (shots.length > MAX_SHOTS) {
        const old = shots.shift()!;
        sim.remove(old);
        bodies.splice(bodies.indexOf(old), 1);
      }
    },
    pour(count) {
      particles.spawn(count, (_, p, v) => {
        p.x = rnd.range(-0.6, 0.6);
        p.y = rnd.range(3, 4.5);
        p.z = rnd.range(-0.3, 0.3);
        v.y = -1;
      });
    },
  };
  build();
  return demo;
}
