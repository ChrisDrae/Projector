import {
  Cloth,
  DirectionalLight,
  Drag,
  Ground,
  PerlinNoise,
  StaticSphere,
  VectorField,
  type Simulation,
} from "projector";
import type { DemoConfig } from "../shared/config.js";

const N = 30;
const SIZE = 1.2;
const TOP = 0.6;
const FLOOR = -0.75;

export const config: DemoConfig = {
  title: "Cloth",
  help: "Drag: orbit · Wheel: zoom\nDistance constraints, Perlin noise wind, sphere and floor colliders.",
  background: "#333131",
  orbit: { button: 0, target: { x: 0, y: -0.05, z: 0.2 }, distance: 2.9, yaw: 2.6, pitch: -0.2 },
  world: { iterations: 12, restitution: 0, friction: 0.5 },
};

export interface ClothDemo {
  cloth: Cloth;
  wind: VectorField;
}

export function setup(sim: Simulation): ClothDemo {
  sim.world.addForce(new Drag(0.01));
  sim.add(new Ground({ y: FLOOR, size: 3, divisions: 18 }));
  sim.add(new StaticSphere({ center: { x: 0, y: -0.15, z: 0.4 }, radius: 0.25 }));

  const noise = new PerlinNoise("wind");
  const wind = sim.world.addForce(
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

  const cloth = sim.add(
    new Cloth({
      width: SIZE,
      height: SIZE,
      columns: N,
      rows: N,
      top: { x: 0, y: TOP, z: 0 },
      mass: 0.02,
      // Radius only pads the colliders (no body-body collisions), so the cloth rests just above surfaces
      radius: 0.012,
      pinned: (i, j) => j === 0 && (i % 4 === 0 || i === N - 1),
    }),
  );

  // A softer fill light from the other side, so both sides of the cloth show their folds
  sim.scene.lights.push(new DirectionalLight({ x: -0.5, y: -0.4, z: -1 }, 0.45));
  return { cloth, wind };
}
