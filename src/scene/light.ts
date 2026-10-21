import type { Vec3 } from "../math/vec3.js";

/** Light arriving from infinitely far away, travelling along `direction`. */
export class DirectionalLight {
  direction: Vec3;
  intensity: number;

  constructor(direction: Vec3 = { x: 0.35, y: -1, z: 0.6 }, intensity: number = 0.75) {
    this.direction = direction;
    this.intensity = intensity;
  }
}

/** Light reaching every face equally. */
export class AmbientLight {
  intensity: number;

  constructor(intensity: number = 0.3) {
    this.intensity = intensity;
  }
}

/** Lambert brightness in [0, 1] for a unit normal, with the normal and lights in the same space. */
export function lambert(normal: Vec3, ambient: AmbientLight, lights: DirectionalLight[]): number {
  let sum = ambient.intensity;
  for (const light of lights) {
    const d = light.direction;
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const facing = -(normal.x * d.x + normal.y * d.y + normal.z * d.z) / len;
    if (facing > 0) sum += facing * light.intensity;
  }
  return sum < 0 ? 0 : sum > 1 ? 1 : sum;
}
