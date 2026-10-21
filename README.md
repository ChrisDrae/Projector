<div align="center">

# Projector

</div>

A TypeScript framework for 3D physics simulations on the Canvas 2D API, with no runtime dependencies:

- **Physics**: particles and spheres in typed arrays (thousands at 60 fps), rigid bodies (boxes, spheres,
  capsules) with friction, stacking and sleeping, colliders, forces, springs and constraints, both colliding
  with each other.
- **Rendering**: a software 3D pipeline built on the `x' = x / z` perspective formula, batched into a handful
  of canvas draw calls, with colored point, spot and hemisphere lights, smooth shading, highlights, lit sphere
  sprites, planar shadows and fog.
- **Framework**: a `Simulation` runtime and reusable objects (`RigidBox`, `ParticleGroup`, `Cloth`, `Ground`,
  ...) that bundle physics and visuals; write your own by extending `SimObject`.

## Getting started

```
npm install
npm run dev
```

`npm run dev` starts Vite. Open the printed URL for the demo gallery; demos reload when you save a file.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with the demo gallery |
| `npm test` / `npm run test:watch` | Unit tests and work budgets (Vitest) |
| `npm run typecheck` | Type-checks the library, demos, tests and benchmarks |
| `npm run build` | Library build: `dist/projector.js` (ESM) and `dist/types` |
| `npm run build:demos` / `npm run preview` | Static build of the demo site in `dist-demos` / serve it |
| `npm run check` | Typecheck, tests and build in one go |
| `npm run perf` | Times every demo against `perf/baseline.json` (see [Performance](#performance)) |
| `npm run perf:baseline` / `perf:rebaseline` | Records baselines for new scenarios / re-records all |

## Demos

- **Cube container**: thousands of spheres inside a box you can spin and throw around. Switch the broadphase
  between accurate and sandbox mode and stress it with "Pile 2000".
- **Gravitation**: n-body attraction with collisions, a disk of bodies orbiting a heavy core. Optionally lit
  by the core.
- **Cloth**: 30×30 distance-constrained particles in Perlin noise wind, draping over a sphere.
- **Flow field**: 4000 particles in an evolving curl-noise field.
- **Rigid bodies**: a box pyramid, capsules and balls; click to throw things, pour particles on the pile.
- **Lighting**: colored point and spot lights, smooth vs flat shading, highlights, sprites, shadows and fog.

Every demo page takes `?bench` (or `?bench=900`): it runs a fixed number of frames and logs the frame,
update and render times. `demo` on the browser console is the running simulation.

## Building a simulation

```ts
import { DirectionalLight, Ground, HemisphereLight, ParticleGroup, RigidBox, RigidSphere, Simulation } from "projector";

const sim = new Simulation({
  canvas: document.querySelector("canvas")!,
  scene: { background: "#1d2026" },
  orbit: { target: { x: 0, y: 0.5, z: 0 }, distance: 4, pitch: -0.3 },
});
sim.scene.lights = [
  new HemisphereLight("#9db4ff", "#3b3127", 0.4),
  new DirectionalLight({ x: -0.5, y: -1, z: 0.3 }, 0.8, { castShadow: true }),
];

sim.add(new Ground({ style: "plane", size: 8, color: "#4b4f58", opacity: 1 }));
for (let k = 0; k < 5; k++) sim.add(new RigidBox(0.4, { position: { x: 0, y: 0.2 + k * 0.41, z: 0 } }));
sim.add(new RigidSphere(0.2, { position: { x: -2, y: 0.2, z: 0 }, velocity: { x: 6, y: 0, z: 0 } }));

const sand = sim.add(new ParticleGroup({ radius: 0.03, shading: "lit", color: "#e0a23a" }));
sand.spawn(500, (_, p) => {
  p.x = Math.random() - 0.5;
  p.y = 3 + Math.random();
  p.z = Math.random() - 0.5;
});
sim.start();
```

`Simulation` owns the physics `World`, the `Scene`, the camera (with orbit controls), the renderer and the
frame loop. Every frame it runs:

1. `onUpdate` listeners, then `update(dt)` on every object
2. `world.step(dt)` in fixed 1/120 s steps; each step first runs `onFixedUpdate` listeners and `fixedUpdate(dt)`
3. `sync()` on every object (physics state into transforms and meshes), then world matrices
4. render, then `onAfterRender` listeners

Without a canvas it runs headless (tests, benchmarks, Node): call `sim.frame(dt)` yourself. `sim.pick(x, y)`
returns what is under the pointer (particles, rigid bodies, colliders).

### Built-in objects

| Object | What it is |
| --- | --- |
| `RigidBox`, `RigidSphere`, `RigidCapsule` (`RigidObject`) | A rigid body and its mesh, kept in sync |
| `ParticleGroup` | Particles or spheres in the world's typed arrays, drawn as one cloud; flat, lit or sprite shaded |
| `Container` | A kinematic box that keeps bodies inside; move and spin it to throw them around |
| `Ground` | A floor: physics plane plus a drawn grid or plane that receives shadows |
| `StaticSphere` | A fixed ball to bounce off or drape over |
| `Cloth` | A sheet of particles held by distance constraints, drawn as a mesh |
| `VelocityTrails` | Motion streaks behind particles |
| `MeshObject` | Any mesh in the scene graph, without physics |

### Writing your own objects

Extend `SimObject`. An object has a transform relative to its parent, children, and resources it owns: scene
nodes, colliders, forces, constraints and lights. Everything it owns is added with it and removed with it.
Point and spot lights added to an object move with it.

```ts
/** A lamp circling the scene: a point light and a glowing bulb that move with it. */
class Lamp extends SimObject {
  private angle = 0;

  constructor(color: string) {
    super();
    this.addLight(new PointLight({ x: 0, y: 0, z: 0 }, { color, intensity: 2 }));
    this.addChild(new MeshObject(Mesh.icosphere(0.05, 1), { color, shading: "unlit" }));
  }

  override update(dt: number): void {
    this.angle += dt;
    this.transform.position.x = Math.cos(this.angle) * 2;
    this.transform.position.y = 1;
    this.transform.position.z = Math.sin(this.angle) * 2;
  }
}
sim.add(new Lamp("#ffb26b"));
```

Objects can combine others. Hot data stays in the world's typed arrays, so an object is a handle to many
bodies, never one object per particle:

```ts
/** Shoots droplets up every frame and recycles one once there are `max`. */
class Fountain extends SimObject {
  readonly drops = new ParticleGroup({ radius: 0.02, shading: "lit", color: "#7fb6ff" });

  constructor(private readonly max: number = 400) {
    super();
    this.addChild(this.drops);
  }

  override update(): void {
    const p = this.transform.position;
    const velocity = { x: Math.random() - 0.5, y: 5, z: Math.random() - 0.5 };
    this.drops.add({ position: { x: p.x, y: p.y, z: p.z }, velocity });
    if (this.drops.count > this.max) this.drops.remove(this.drops.idAt(0));
  }
}
```

The hooks: `onAttach(sim)` / `onDetach(sim)` to create and destroy bodies, `update(dt)` every frame before
physics, `fixedUpdate(dt)` every physics step, `sync()` after physics.

### New kinds of 3D objects

When meshes, clouds and lines don't cover it, a `CustomNode` draws itself. Its `emit` runs once per frame and
draws through the same pipeline as everything else: world-space polygons, lines and circles are transformed,
clipped, projected, depth sorted and batched, and `litStyle` shades them with the scene lights.

```ts
/** Draws every rigid body's velocity as a line on top of the scene. */
class VelocityArrows implements CustomNode {
  readonly kind = "custom" as const;
  visible = true;
  layer: number = Layer.Overlay;

  constructor(private readonly world: World) {}

  emit(ctx: EmitContext): void {
    const style = ctx.style(null, "#ffd166", 2);
    const s = this.world.rigid;
    for (let i = 0; i < s.count; i++) {
      const o = i * 3;
      const [x, y, z] = [s.pos[o], s.pos[o + 1], s.pos[o + 2]];
      ctx.line3D(this.layer, style, x, y, z, x + s.vel[o] * 0.2, y + s.vel[o + 1] * 0.2, z + s.vel[o + 2] * 0.2);
    }
  }
}
sim.scene.add(new VelocityArrows(sim.world));
```

The examples in this README are type-checked in `tests/readmeExamples.ts`.

## Architecture

```
src/
  framework/  Simulation, SimObject and the built-in objects
  math/       vec3 (allocation-free), quat, mat4, Transform, the Vec class
  scene/      PerspectiveCamera, Mesh, Material, lights, Scene and its nodes
  rendering/  RenderBackend, the software pipeline (emit, lighting, shadows, sprites, queue),
              Canvas2DBackend with its rasterizer and sprite cache
  physics/    World, BodyStore, broadphase, contacts, colliders, forces, constraints, raycasts
    rigid/    rigid body store, shapes, narrowphase, solver pipeline
  controls/   KeyboardState, PointerDrag, OrbitControls
  utility/    PerlinNoise, Random, frame loop
  legacy.ts   the original free functions (project, toScreenCoordinates, rotateAround*)
demos/        each demo: setup.ts (DOM-free content, shared with the benchmarks) and main.ts (page, HUD)
perf/         benchmark scenarios, harness and baselines
tests/        Vitest unit tests and work budgets
```

The low-level API stays public underneath the framework: `world.addBody`, `world.addRigidBody`, `scene.add`,
`world.addForce` and so on, for anything the objects don't cover.

<div align="center">

# 3D Animation

</div>

The basis for the 3D is this perspective formula:

<div align="center">

## $x' = \frac{x}{z}, \quad y' = \frac{y}{z}$

![3D](https://github.com/user-attachments/assets/37327168-5bec-469c-b144-f376c970d03c)

</div>

It is still the core of the renderer. A `PerspectiveCamera` (position, quaternion rotation, field of view)
transforms points into view space, and the projection is `cx + sx * x / z`, `cy - sy * y / z`. With the default
90° field of view the focal length is 1, so the default camera at `z = -1.5` reproduces the original pipeline
exactly (a test checks this). On top of that:

- **Near-plane clipping**: polygons and lines crossing behind the camera are clipped before the divide, so
  orbiting through geometry never produces garbage.
- **One render call per frame** ([#3](https://github.com/ChrisDrae/Projector/issues/3)): objects don't draw
  themselves. They submit primitives to a `RenderQueue`, which sorts them once (back to front in the world
  layer) and draws runs of the same style as a single path with one `fill()`/`stroke()`. The cube demo went
  from a `beginPath`/`fill`/`stroke` per circle and per edge to about 20 draw calls for 1000 spheres.
- **Layers**: background, shadows, world (depth sorted) and overlay. Convex meshes can sort as a whole
  (`sortMode: "object"`) so neighbors in a stack never cut into each other.
- **Pluggable backends**: the `RenderBackend` interface takes the scene and camera, so a WebGL backend can be
  added next to `Canvas2DBackend` without touching scenes or physics.

### Lighting and shading

Canvas 2D has no shaders, depth buffer or per-vertex colors, so lighting is computed in the software pipeline
and baked into fill styles; the canvas only fills. [docs/lighting.md](docs/lighting.md) explains the techniques,
their costs and limits, and what would need WebGL.

- **Lights**: `AmbientLight`, `HemisphereLight`, `DirectionalLight`, `PointLight` and `SpotLight`, all colored.
  Point and spot lights fall off with distance; spot lights have a soft cone edge.
- **Materials**: `shading: "flat" | "smooth" | "unlit"`, Blinn-Phong `specular` and `shininess`, `emissive`.
  Flat faces are lit per face and quantized to shared styles, so they stay batched. Smooth faces are lit per
  corner and filled with canvas gradients.
- **Spheres**: `SphereCloud.shading` / `ParticleGroup({ shading })`: `"flat"` (depth-cued dots), `"lit"` (one
  lit color each) or `"sprite"` (a shaded ball image with a highlight, rendered once and reused; tiny spheres
  fall back to lit dots).
- **Shadows**: lights with `castShadow` project meshes with `castShadow` and sphere clouds onto `receiveShadow`
  planes such as a `Ground`, merged into one draw call per floor.
- **Fog**: `scene.fog = { color, near, far }`.

<div align="center">

# Particle Animation and Collision

![particles](https://github.com/user-attachments/assets/4c660a08-4b94-4058-b0d3-4bffed4bff41)

# 3D Collision

![combo](https://github.com/user-attachments/assets/f1582f38-8829-4316-8bab-f034e5c665cc)

# Gravitation

![combo](https://github.com/user-attachments/assets/c205217d-c5cf-4506-af08-258bfb359b9f)

</div>

## Physics

- **Structure of arrays** ([#2](https://github.com/ChrisDrae/Projector/issues/2)): particles live in flat
  `Float32Array`s (`pos`, `vel`, `force`, `radius`, `mass`, ...) inside a `BodyStore`, rigid bodies in
  `Float64Array`s inside a `RigidBodyStore`, instead of one object per body. The renderer reads the same arrays
  without copying.
- **Fixed timestep**: `world.step(frameDt)` advances in fixed 1/120 s steps, so the simulation behaves the same at
  any frame rate.
- **Particles**: mass-weighted contact projection and equal and opposite impulses (restitution, friction), so
  momentum is conserved.
- **Rigid bodies**: boxes, spheres and capsules with mass and inertia, static and kinematic bodies. Contacts
  come from a 15-axis separating axis test with face clipping for boxes and closest points for capsules, up to
  four points per pair. A sequential impulse solver with friction, restitution and speculative contacts is warm
  started from the previous step's impulses so stacks rest. Groups of touching bodies that stay still fall
  asleep and wake when touched.
- **Both together**: particles and rigid bodies collide with each other, and both with the colliders.
- **Colliders**: `BoxContainer` (a kinematic box that keeps bodies inside; spinning or moving it throws them
  around), `PlaneCollider`, `SphereCollider`.
- **Forces and constraints**: gravity, `Drag`, `Attractor`, `VectorField`, `NBodyGravity`, `SpringSet`,
  `DistanceConstraintSet`.
- **Collision groups**: `world.setCollision(groupA, groupB, false)` keeps groups apart (every `ParticleGroup` has
  its own group). Filtering happens after the pair search, so it costs nothing when unused.
- **Picking**: `world.raycast(origin, dir)` and `camera.screenToRay(x, y, ...)`.

## Optimisations

Collision check partitioning was the first big optimisation in this project: instead of checking every circle
against every other, circles are put into grid cells and only check their neighbors. Its failure mode
([#1](https://github.com/ChrisDrae/Projector/issues/1)): when many circles end up in the same cell, it falls back to O(n²).

The `HashGrid` broadphase works on the typed arrays: integer cell hashes and a counting sort, with no string keys
and no allocations per frame. Crowded buckets are handled in one of two modes:

- **accurate** (default): crowded buckets are sorted along x and searched with a binary search plus a sweep
  limited by the largest radius in that bucket. Every overlapping pair is still found.
- **sandbox**: each bucket keeps at most `maxPerCell` bodies and the rest skip body-body collisions for that step
  (rotating, so nobody is left out for long). The cost is bounded no matter what happens.

Bodies also can't collapse into the same cell any more: the solver keeps them apart and the moving box pushes
bodies with its walls instead of teleporting them into a corner. In the cube demo, 4000 spheres dropped on a
single point spread out again within about a second.

## Performance

The framework must not make simulations slower than wiring the parts by hand. Guardrails:

- **Timing baseline**: `perf/scenarios` runs every demo's own setup code headless with scripted input.
  `npm run perf` times physics, emit and raster per frame (median over 600 frames) and samples steady-state
  allocation with V8's heap profiler. It fails when a median is more than 20% slower than `perf/baseline.json`.
  The baselines of the original four demos were recorded on the implementation from before the framework
  existed (tag `perf-baseline`) and are kept as they are; new demos add their own entries.
- **Work budgets** (in `npm test`): deterministic counters per demo (primitives, draw calls, path commands,
  contact pairs, broadphase tests) may not grow more than 10%. They are the same on every machine.
- **Rules**: hot data stays in typed arrays; objects are handles; no per-frame allocation in the step, emit and
  draw paths (the opt-in smooth shading and sprite paths allocate a few KB per frame for canvas gradients and
  new sprites); features cost nothing until used.

Timings depend on the machine and what else runs on it (a demo animating in a browser tab skews them). When in
doubt, compare against the baseline commit directly: check it out in a worktree and run `npm run perf` in both,
back to back.

### Further ideas

- A WebGL2 backend: per-pixel lighting and shadow maps, `SphereCloud`s as instances straight from the arrays
- Joints (ball, hinge) and convex hull shapes for rigid bodies
- Glow and bloom with `"lighter"` compositing
- Barnes-Hut for n-body gravity beyond a few thousand bodies
- Moving the simulation to a Web Worker with the typed arrays as transferable buffers
