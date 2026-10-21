import type { Vec3 } from "../math/vec3.js";

export interface LightOptions {
  /** Any CSS color. Default white. */
  color?: string;
}

export interface DirectionalLightOptions extends LightOptions {
  /** Casts planar shadows onto shadow receivers. */
  castShadow?: boolean;
}

/** Light arriving from infinitely far away, travelling along `direction`. */
export class DirectionalLight {
  readonly kind: "directional" = "directional";
  direction: Vec3;
  intensity: number;
  color: string;
  castShadow: boolean;

  constructor(direction: Vec3 = { x: 0.35, y: -1, z: 0.6 }, intensity: number = 0.75, options: DirectionalLightOptions = {}) {
    this.direction = direction;
    this.intensity = intensity;
    this.color = options.color ?? "#ffffff";
    this.castShadow = options.castShadow ?? false;
  }
}

/** Light reaching every face equally. */
export class AmbientLight {
  readonly kind: "ambient" = "ambient";
  intensity: number;
  color: string;

  constructor(intensity: number = 0.3, options: LightOptions = {}) {
    this.intensity = intensity;
    this.color = options.color ?? "#ffffff";
  }
}

/**
 * Ambient light that depends on which way a face points: `sky` from above, `ground` from below, blended
 * in between. A cheap stand-in for light bounced off the sky and the floor.
 */
export class HemisphereLight {
  readonly kind: "hemisphere" = "hemisphere";
  sky: string;
  ground: string;
  intensity: number;

  constructor(sky: string = "#bcd7ff", ground: string = "#4a3f35", intensity: number = 0.5) {
    this.sky = sky;
    this.ground = ground;
    this.intensity = intensity;
  }
}

export interface PointLightOptions extends LightOptions {
  intensity?: number;
  /** Distance at which the light fades out completely; 0 never cuts off. Default 0. */
  distance?: number;
  /** How fast the light falls off with distance d, as 1 / d^decay (2 is physical). Default 2. */
  decay?: number;
  castShadow?: boolean;
}

/** Light shining in all directions from a point, falling off with distance. Intensity is the strength at distance 1. */
export class PointLight {
  readonly kind: "point" = "point";
  position: Vec3;
  intensity: number;
  color: string;
  distance: number;
  decay: number;
  castShadow: boolean;

  constructor(position: Vec3 = { x: 0, y: 1, z: 0 }, options: PointLightOptions = {}) {
    this.position = position;
    this.intensity = options.intensity ?? 1;
    this.color = options.color ?? "#ffffff";
    this.distance = options.distance ?? 0;
    this.decay = options.decay ?? 2;
    this.castShadow = options.castShadow ?? false;
  }
}

export interface SpotLightOptions extends PointLightOptions {
  /** Half angle of the cone in radians. Default π/6. */
  angle?: number;
  /** 0..1: fraction of the cone over which the edge softens. Default 0.2. */
  penumbra?: number;
}

/** A point light limited to a cone around `direction`. */
export class SpotLight {
  readonly kind: "spot" = "spot";
  position: Vec3;
  direction: Vec3;
  intensity: number;
  color: string;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
  castShadow: boolean;

  constructor(position: Vec3 = { x: 0, y: 1, z: 0 }, direction: Vec3 = { x: 0, y: -1, z: 0 }, options: SpotLightOptions = {}) {
    this.position = position;
    this.direction = direction;
    this.intensity = options.intensity ?? 1;
    this.color = options.color ?? "#ffffff";
    this.distance = options.distance ?? 0;
    this.decay = options.decay ?? 2;
    this.angle = options.angle ?? Math.PI / 6;
    this.penumbra = options.penumbra ?? 0.2;
    this.castShadow = options.castShadow ?? false;
  }
}

/** Lights that go in Scene.lights (the ambient light has its own slot, Scene.ambient). */
export type Light = DirectionalLight | HemisphereLight | PointLight | SpotLight;

/** Lights with a position, which can be attached to objects. */
export type PositionalLight = PointLight | SpotLight;

/**
 * Lambert brightness in [0, 1] for a unit normal, with the normal and lights in the same space. Only the
 * ambient and directional lights count, as white light (the emitter does the full color model).
 */
export function lambert(normal: Vec3, ambient: AmbientLight, lights: Light[]): number {
  let sum = ambient.intensity;
  for (const light of lights) {
    if (light.kind !== "directional") continue;
    const d = light.direction;
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const facing = -(normal.x * d.x + normal.y * d.y + normal.z * d.z) / len;
    if (facing > 0) sum += facing * light.intensity;
  }
  return sum < 0 ? 0 : sum > 1 ? 1 : sum;
}

/**
 * Brightness factor of a point or spot light at distance d: 1 / d^decay (capped near the light), times
 * a smooth window that reaches zero at `distance` when it is set.
 */
export function attenuation(d: number, distance: number, decay: number): number {
  let a = 1 / Math.max(d, 0.01) ** decay;
  if (distance > 0) {
    const x = d / distance;
    const w = 1 - x * x * x * x;
    a *= w > 0 ? w * w : 0;
  }
  return a;
}
