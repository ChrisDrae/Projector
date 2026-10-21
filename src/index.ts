// Math
export * as vec3 from "./math/vec3.js";
export type { Vec3 } from "./math/vec3.js";
export * as quat from "./math/quat.js";
export type { Quat } from "./math/quat.js";
export * as mat4 from "./math/mat4.js";
export type { Mat4 } from "./math/mat4.js";
export { Vec } from "./math/vec.js";
export { Transform } from "./math/transform.js";
export { clamp, lerp, nextPow2, EPSILON } from "./math/scalar.js";

// Utilities
export { PerlinNoise, perlin, toUnit } from "./utility/perlin.js";
export type { FbmOptions } from "./utility/perlin.js";
export { Random } from "./utility/random.js";

// Legacy free-function pipeline
export {
  rotateAroundX,
  rotateAroundY,
  rotateAroundZ,
  translateZ,
  toCamera,
  project,
  toScreenCoordinates,
  LEGACY_CAMERA_Z,
} from "./legacy.js";
export type { Vec2 } from "./legacy.js";
