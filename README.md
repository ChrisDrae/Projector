<div align="center">

# Projector

</div>

A TypeScript library for rendering physics simulations and the behavior of natural systems in the browser:
a Canvas 2D 3D renderer built on the `x' = x / z` perspective formula, and a particle / sphere physics engine
with no runtime dependencies.

## Getting started

```
npm install
npm run dev
```

`npm run dev` starts Vite. Open the printed URL for the demo gallery; demos reload when you save a file.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with the demo gallery |
| `npm test` / `npm run test:watch` | Unit tests (Vitest) |
| `npm run typecheck` | Type-checks the library, demos and tests |
| `npm run build` | Library build: `dist/projector.js` (ESM) and `dist/types` |
| `npm run build:demos` / `npm run preview` | Static build of the demo site in `dist-demos` / serve it |
| `npm run check` | Typecheck, tests and build in one go |

## Demos

- **Cube container**: thousands of spheres inside a box you can spin and throw around. Switch the broadphase
  between accurate and sandbox mode and stress it with "Pile 2000".
- **Gravitation**: n-body attraction with collisions, a disk of bodies orbiting a heavy core.
- **Cloth**: 30×30 distance-constrained particles in Perlin noise wind, draping over a sphere.
- **Flow field**: 4000 particles in an evolving curl-noise field.

## Using the library

```ts
import { BoxContainer, Canvas2DBackend, Mesh, MeshNode, OrbitControls, PerspectiveCamera, Scene, SphereCloud, World, startLoop } from "projector";

const canvas = document.querySelector("canvas")!;
const backend = new Canvas2DBackend(canvas);
const camera = new PerspectiveCamera();
new OrbitControls(camera, canvas, { distance: 1.5 });
const scene = new Scene({ background: "#333131" });

const world = new World({ gravity: { x: 0, y: -9.8, z: 0 }, restitution: 0.3 });
const box = world.addCollider(new BoxContainer({ size: 0.5 }));
for (let i = 0; i < 1000; i++) {
  world.addBody({ position: { x: Math.random() * 0.4 - 0.2, y: Math.random() * 0.4 - 0.2, z: 0 }, radius: 0.003 });
}

// Spheres are drawn straight from the physics arrays; the box mesh shares the collider's transform
scene.add(new SphereCloud(world.bodies, { color: "rgb(160, 212, 91)" }));
scene.add(new MeshNode(Mesh.box(0.5), { color: "#d618c6", wireframe: true }, box.transform));

startLoop((dt) => {
  box.angularVelocity.y = 1;
  world.step(dt);
  backend.render(scene, camera);
});
```

## Architecture

```
src/
  math/       vec3 (allocation-free), quat, mat4, Transform, the Vec class
  scene/      PerspectiveCamera, Mesh, Material, lights, Scene and its nodes
  rendering/  RenderBackend interface, software pipeline, Canvas2DBackend
  physics/    World, BodyStore, broadphase, contacts, colliders, forces, constraints
  controls/   KeyboardState, PointerDrag, OrbitControls
  utility/    PerlinNoise, Random, frame loop
  legacy.ts   the original free functions (project, toScreenCoordinates, rotateAround*)
demos/        example apps, importing the library as "projector"
tests/        Vitest unit tests
```

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
- **Back-face culling, flat shading and depth cueing**: faces are lit by ambient and directional lights,
  spheres fade toward the background with distance.
- **One render call per frame** ([#3](https://github.com/ChrisDrae/Projector/issues/3)): objects don't draw
  themselves any more. They submit primitives to a `RenderQueue`, which sorts them once (back to front in the
  world layer) and draws runs of the same style as a single path with one `fill()`/`stroke()`. The cube demo
  went from a `beginPath`/`fill`/`stroke` per circle and per edge to about 20 draw calls for 1000 spheres.
- **Pluggable backends**: the `RenderBackend` interface takes the scene and camera, so a WebGL backend can be
  added next to `Canvas2DBackend` without touching scenes or physics.

<div align="center">

# Particle Animation and Collision

![particles](https://github.com/user-attachments/assets/4c660a08-4b94-4058-b0d3-4bffed4bff41)

# 3D Collision

![combo](https://github.com/user-attachments/assets/f1582f38-8829-4316-8bab-f034e5c665cc)

# Gravitation

![combo](https://github.com/user-attachments/assets/c205217d-c5cf-4506-af08-258bfb359b9f)

</div>

## Physics

- **Structure of arrays** ([#2](https://github.com/ChrisDrae/Projector/issues/2)): all bodies live in flat
  `Float32Array`s (`pos`, `vel`, `force`, `radius`, `mass`, ...) inside a `BodyStore` instead of one object per
  circle. No pointer chasing, and the renderer reads the same arrays without copying.
- **Fixed timestep**: `world.step(frameDt)` advances in fixed 1/120 s steps, so the simulation behaves the same at
  any frame rate.
- **Impulse solver**: sphere contacts are separated by inverse mass and resolved with equal and opposite impulses
  (restitution, friction), so momentum is conserved.
- **Colliders**: `BoxContainer` (a kinematic box that keeps bodies inside; spinning or moving it throws them
  around), `PlaneCollider`, `SphereCollider`.
- **Forces and constraints**: gravity, `Drag`, `Attractor`, `VectorField`, `NBodyGravity`, `SpringSet`,
  `DistanceConstraintSet`.

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

### Further ideas

- A WebGL2 backend that draws `SphereCloud`s as instances straight from the body arrays
- Barnes-Hut for n-body gravity beyond a few thousand bodies
- Moving the simulation to a Web Worker with the typed arrays as transferable buffers
