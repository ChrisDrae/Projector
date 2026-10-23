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

/** Receives the fixed shapes a collider reports around a rigid body (see Collider.rigidShapes). */
export interface StaticShapeSink {
  /** The plane dot(n, p) = offset with unit normal n; bodies stay on the side n points to. */
  plane(nx: number, ny: number, nz: number, offset: number): void;
  /** An axis-aligned box: center and half extents. */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void;
  sphere(cx: number, cy: number, cz: number, radius: number): void;
}

/**
 * Static or kinematic shape the bodies collide with (containers, floors, obstacles).
 *
 * Particles collide with any collider through solve(). Rigid bodies collide with the built-in
 * PlaneCollider, SphereCollider and BoxContainer, and with any other collider that implements
 * rigidShapes(); a collider without it lets rigid bodies pass through.
 */
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
  /**
   * Optional fixed geometry for rigid bodies: called once per step for every awake dynamic rigid body,
   * with a sphere around it (its bounding sphere plus the contact margin). Report the planes, boxes and
   * spheres that body may touch to `out`; it collides with them like with the built-in colliders,
   * resting and sleeping on them. Geometry that changes under a sleeping body doesn't wake it.
   * Bodies sliding across the seam of two adjacent boxes can catch on their inner edges: report merged
   * boxes or planes where the surface is flat.
   */
  rigidShapes?(x: number, y: number, z: number, radius: number, out: StaticShapeSink): void;
  /** Surface of the shapes reported by rigidShapes; the world's when null or not set. */
  friction?: number | null;
  restitution?: number | null;
}
