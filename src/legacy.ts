import type { Vec3 } from "./math/vec3.js";

// The original free-function pipeline, kept so existing sketches keep working.
// New code should use PerspectiveCamera + a RenderBackend, and quaternions/Transform for rotation.

export type Vec2 = { x: number; y: number };

/** @deprecated Use `Transform.rotateWorld` or the `quat` functions. */
export function rotateAroundZ({ x, y, z }: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x * c - y * s,
    y: x * s + y * c,
    z,
  };
}

/**
 * @deprecated Use `Transform.rotateWorld` or the `quat` functions.
 * Note: unlike X and Z, this rotates by -angle under the right-hand rule (`quat.setAxisAngle(q, Y, -angle)`).
 */
export function rotateAroundY({ x, y, z }: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x * c - z * s,
    y,
    z: x * s + z * c,
  };
}

/** @deprecated Use `Transform.rotateWorld` or the `quat` functions. */
export function rotateAroundX({ x, y, z }: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x,
    y: y * c - z * s,
    z: y * s + z * c,
  };
}

/** @deprecated Use `Transform.translate`. */
export function translateZ({ x, y, z }: Vec3, dz: number): Vec3 {
  return {
    x,
    y,
    z: z + dz,
  };
}

/** The fixed camera of the original renderer: at z = -1.5, looking along +z. */
export const LEGACY_CAMERA_Z = -1.5;

/** @deprecated Use `PerspectiveCamera`. */
export function toCamera(p: Vec3): Vec3 {
  return { x: p.x, y: p.y, z: p.z - LEGACY_CAMERA_Z };
}

/** The core perspective formula: x' = x / z, y' = y / z. @deprecated Use a RenderBackend. */
export function project({ x, y, z }: Vec3): Vec2 {
  return {
    x: x / z,
    y: y / z,
  };
}

/** Maps [-1, 1] to pixels with y pointing down. @deprecated Use a RenderBackend. */
export function toScreenCoordinates(p: Vec2, d: [number, number]): Vec2 {
  return {
    x: ((p.x + 1) / 2) * d[0],
    y: (1 - (p.y + 1) / 2) * d[1],
  };
}
