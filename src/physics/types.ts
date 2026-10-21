import type { Vec3 } from "../math/vec3.js";
import type { BodyStore } from "./bodyStore.js";

/** Stable handle of a body. Survives removal of other bodies (indices do not). */
export type BodyId = number;

export const BodyFlags = {
  /** Takes part in body-body collisions. */
  Collides: 1,
  /** Never moves (infinite mass); still attracts in n-body gravity and anchors constraints. */
  Static: 2,
} as const;

export type Precision = "f32" | "f64";

export interface BodyOptions {
  position: Vec3;
  velocity?: Vec3;
  /** 0 makes a point particle. Default 0. */
  radius?: number;
  /** Default 1. */
  mass?: number;
  isStatic?: boolean;
  /** Default: radius > 0. */
  collides?: boolean;
  /** Collision group 0-31 (default 0), see World.setCollision and World.createGroup. */
  group?: number;
}

/** Shared parameters handed to contact and collider solvers each step. */
export interface SolverSettings {
  restitution: number;
  friction: number;
  /** Fraction of the remaining overlap removed per iteration (0..1). */
  positionCorrection: number;
  /** Overlap tolerated without correction, as a fraction of the summed radii. */
  slop: number;
  /** Approach speed below which collisions are treated as resting (no bounce, no jitter). */
  restThreshold: number;
}

/** Applies forces by adding to `bodies.force`, once per fixed step. */
export interface ForceGenerator {
  apply(bodies: BodyStore, dt: number, time: number): void;
}

/** Corrects positions/velocities directly, once per solver iteration. */
export interface Constraint {
  solve(bodies: BodyStore, dt: number): void;
}

/** Static or kinematic shape the bodies collide with (containers, floors, obstacles). */
export interface Collider {
  /** Advances kinematic motion, once per fixed step before collisions are solved. */
  update(dt: number): void;
  /** Resolves penetration and velocity for every body, once per solver iteration. */
  solve(bodies: BodyStore, settings: SolverSettings): void;
  /**
   * Optional ray test for picking: distance along the ray (unit `dir`) to the surface, writing the
   * surface normal to `normal`, or -1 for a miss.
   */
  raycast?(origin: Vec3, dir: Vec3, normal: Vec3): number;
}
