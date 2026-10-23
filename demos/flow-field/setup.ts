import {
  Container,
  Drag,
  ParticleGroup,
  PerlinNoise,
  Random,
  VectorField,
  VelocityTrails,
  type Simulation,
} from "projector";
import type { DemoConfig } from "../shared/config.js";

const COUNT = 4000;
const BOX = 3;
const E = 0.05;

export const config: DemoConfig = {
  title: "Flow field",
  help: "Drag: orbit · Wheel: zoom\nParticles carried by an evolving curl-noise field built from 3D Perlin noise.",
  background: "#1b1a1a",
  orbit: { button: 0, distance: 4.6, yaw: 0.5, pitch: -0.35 },
  world: { gravity: { x: 0, y: 0, z: 0 }, iterations: 1, restitution: 1 },
};

export interface FlowFieldDemo {
  field: VectorField;
  /** Noise frequency and how fast the field changes over time. */
  params: { scale: number; evolve: number };
}

export function setup(sim: Simulation): FlowFieldDemo {
  const box = new Container({ size: BOX, material: { opacity: 0.5 } });
  const particles = new ParticleGroup({ radius: 0, render: "points", color: "rgb(200, 236, 150)", pointSize: 2, depthCue: 0.65 });
  sim.add(new VelocityTrails(particles, { length: 0.05, color: "rgb(160, 212, 91)", opacity: 0.35 }));
  sim.add(particles);
  sim.add(box);
  sim.world.addForce(new Drag(1.5));

  const params = { scale: 0.9, evolve: 0.15 };
  const noise = new PerlinNoise("flow");
  /** Three independent noise potentials; their curl is a divergence-free flow (no sinks where particles pile up). */
  const potential = (k: number, x: number, y: number, z: number, w: number): number =>
    noise.noise3D(x * params.scale + k * 31.4, y * params.scale + w, z * params.scale - k * 17.3);
  const field = sim.world.addForce(
    new VectorField(
      (x, y, z, t, out) => {
        const w = t * params.evolve;
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
  particles.spawn(COUNT, (_, p) => box.randomPoint(rnd, p, 0.01));
  return { field, params };
}
