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
export type { MaterialOptions, Shading, Side } from "./scene/material.js";
export {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PointLight,
  SpotLight,
  attenuation,
  lambert,
} from "./scene/light.js";
export type {
  DirectionalLightOptions,
  Light,
  LightOptions,
  PointLightOptions,
  PositionalLight,
  SpotLightOptions,
} from "./scene/light.js";
export { Layer, LineSet, MeshNode, PointCloud, SphereCloud } from "./scene/nodes.js";
export type {
  CustomNode,
  LineSetOptions,
  PointCloudOptions,
  PointSource,
  SphereCloudOptions,
  SortMode,
  SphereShading,
  SphereSource,
} from "./scene/nodes.js";
export { Scene } from "./scene/scene.js";
export type { Fog, SceneNode, SceneOptions, ShadowStyle } from "./scene/scene.js";

// Rendering
export type { RenderBackend, RenderStats } from "./rendering/backend.js";
export { colorOf, mix, parseColor, shade, toCss } from "./rendering/color.js";
export type { RGB } from "./rendering/color.js";
export { Canvas2DBackend } from "./rendering/canvas2d/canvas2dBackend.js";
export type { Canvas2DBackendOptions } from "./rendering/canvas2d/canvas2dBackend.js";
export { Rasterizer } from "./rendering/canvas2d/rasterizer.js";
export type { Canvas2DLike, SpriteSource } from "./rendering/canvas2d/rasterizer.js";
export { SpriteCache, defaultCanvasFactory } from "./rendering/canvas2d/spriteCache.js";
export type { CanvasFactory, SpriteCanvas } from "./rendering/canvas2d/spriteCache.js";
export { SpriteTable, renderSprite } from "./rendering/software/sprites.js";
export type { SpriteParams } from "./rendering/software/sprites.js";
export { SoftwareEmitter, SHADE_LEVELS } from "./rendering/software/emit.js";
export { Lighting, MAX_LIGHTS } from "./rendering/software/lighting.js";
export type { SphereLight } from "./rendering/software/lighting.js";
export { ShadowProjector } from "./rendering/software/shadows.js";
export type { EmitContext } from "./rendering/software/emit.js";
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
export type { RaycastHit, StepListener, StepStats, WorldOptions } from "./physics/world.js";
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
export type { BoundsSource, BroadphaseMode, BroadphaseOptions, BroadphaseStats } from "./physics/broadphase.js";
export { Attractor, Drag, VectorField } from "./physics/forces.js";
export type { FieldFunction, VectorFieldOptions } from "./physics/forces.js";
export { NBodyGravity, kineticEnergy } from "./physics/nbody.js";
export { DistanceConstraintSet, SpringSet } from "./physics/constraints.js";
export type { DistanceConstraintOptions, SpringOptions } from "./physics/constraints.js";
export { solveContacts } from "./physics/contacts.js";
export { rayPlane, raySphere } from "./physics/raycast.js";
export { RigidBodyStore, RigidFlags } from "./physics/rigid/rigidStore.js";
export type { RigidBodyId, RigidBodyOptions } from "./physics/rigid/rigidStore.js";
export { ShapeType, Shapes, boundingRadius, inertia, shapeVolume } from "./physics/rigid/shapes.js";
export type { Shape } from "./physics/rigid/shapes.js";
export { RigidPipeline, defaultRigidSettings } from "./physics/rigid/rigidPipeline.js";
export type { RigidSettings, RigidStats } from "./physics/rigid/rigidPipeline.js";
export { Manifold } from "./physics/rigid/narrowphase.js";
export { integratePositions, integrateVelocities } from "./physics/integrate.js";

// Controls
export { KeyboardState } from "./controls/keyboard.js";
export { PointerDrag } from "./controls/pointerDrag.js";
export type { PointerDragOptions } from "./controls/pointerDrag.js";
export { OrbitControls, placeOrbitCamera } from "./controls/orbitControls.js";
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

// Framework
export { Simulation } from "./framework/simulation.js";
export type { FrameListener, SimulationOptions, SimulationStats } from "./framework/simulation.js";
export { SimObject } from "./framework/simObject.js";
export type { SimObjectOptions } from "./framework/simObject.js";
export { ParticleGroup } from "./framework/objects/particleGroup.js";
export type { ParticleGroupOptions, ParticleOptions } from "./framework/objects/particleGroup.js";
export { Container } from "./framework/objects/container.js";
export type { ContainerOptions } from "./framework/objects/container.js";
export { Ground } from "./framework/objects/ground.js";
export type { GroundOptions } from "./framework/objects/ground.js";
export { StaticSphere } from "./framework/objects/staticSphere.js";
export type { StaticSphereOptions } from "./framework/objects/staticSphere.js";
export { Cloth } from "./framework/objects/cloth.js";
export type { ClothOptions } from "./framework/objects/cloth.js";
export { VelocityTrails } from "./framework/objects/velocityTrails.js";
export type { VelocityTrailsOptions } from "./framework/objects/velocityTrails.js";
export { MeshObject } from "./framework/objects/meshObject.js";
export type { MeshObjectOptions } from "./framework/objects/meshObject.js";
export { RigidBox, RigidCapsule, RigidObject, RigidSphere, meshFor } from "./framework/objects/rigidObject.js";
export type { RigidObjectOptions } from "./framework/objects/rigidObject.js";
