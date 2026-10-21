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

// Scene
export { PerspectiveCamera } from "./scene/camera.js";
export type { PerspectiveCameraOptions } from "./scene/camera.js";
export { Mesh } from "./scene/mesh.js";
export { Material } from "./scene/material.js";
export type { MaterialOptions, Side } from "./scene/material.js";
export { AmbientLight, DirectionalLight, lambert } from "./scene/light.js";
export { Layer, LineSet, MeshNode, PointCloud, SphereCloud } from "./scene/nodes.js";
export type {
  LineSetOptions,
  PointCloudOptions,
  PointSource,
  SphereCloudOptions,
  SphereSource,
} from "./scene/nodes.js";
export { Scene } from "./scene/scene.js";
export type { SceneNode, SceneOptions } from "./scene/scene.js";

// Rendering
export type { RenderBackend, RenderStats } from "./rendering/backend.js";
export { mix, parseColor, shade, toCss } from "./rendering/color.js";
export type { RGB } from "./rendering/color.js";
export { Canvas2DBackend } from "./rendering/canvas2d/canvas2dBackend.js";
export type { Canvas2DBackendOptions } from "./rendering/canvas2d/canvas2dBackend.js";
export { Rasterizer } from "./rendering/canvas2d/rasterizer.js";
export type { Canvas2DLike } from "./rendering/canvas2d/rasterizer.js";
export { SoftwareEmitter, SHADE_LEVELS } from "./rendering/software/emit.js";
export { PrimitiveKind, RenderQueue, StyleTable } from "./rendering/software/renderQueue.js";
export type { Style } from "./rendering/software/renderQueue.js";
export {
  createProjection,
  projectX,
  projectY,
  sphereScreenRadius,
  updateProjection,
} from "./rendering/software/projection.js";
export type { ProjectionParams } from "./rendering/software/projection.js";
export { clipPolygonNear, clipSegmentNear } from "./rendering/software/clip.js";

// Physics
export { World } from "./physics/world.js";
export type { StepStats, WorldOptions } from "./physics/world.js";
export { BodyStore } from "./physics/bodyStore.js";
export type { FloatArray } from "./physics/bodyStore.js";
export { BodyFlags } from "./physics/types.js";
export type {
  BodyId,
  BodyOptions,
  Collider,
  Constraint,
  ForceGenerator,
  Precision,
  SolverSettings,
} from "./physics/types.js";
export { BoxContainer, PlaneCollider, SphereCollider } from "./physics/colliders.js";
export type { BoxContainerOptions, ColliderMaterial, SphereColliderOptions } from "./physics/colliders.js";
export { HashGrid } from "./physics/broadphase.js";
export type { BroadphaseOptions, BroadphaseStats } from "./physics/broadphase.js";
export { solveContacts } from "./physics/contacts.js";
export { integratePositions, integrateVelocities } from "./physics/integrate.js";

// Controls
export { KeyboardState } from "./controls/keyboard.js";
export { PointerDrag } from "./controls/pointerDrag.js";
export type { PointerDragOptions } from "./controls/pointerDrag.js";
export { OrbitControls } from "./controls/orbitControls.js";
export type { OrbitControlsOptions } from "./controls/orbitControls.js";

// Utilities
export { PerlinNoise, perlin, toUnit } from "./utility/perlin.js";
export type { FbmOptions } from "./utility/perlin.js";
export { Random } from "./utility/random.js";
export { FpsCounter, startLoop } from "./utility/loop.js";
export type { Loop } from "./utility/loop.js";

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
