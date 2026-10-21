# Requirements from building Craft

Craft (`../Craft`) is a Minecraft-style voxel demo built on Projector 0.2.0 as an outside consumer: a
`CustomNode` that draws every visible block face, a first-person player with pointer-lock mouse look, and
block collision. These requirements come from what that project had to work around, and from profiling it
in Chrome at 1536×863 (3,965 faces at a 48-block view, 14,615 at 96).

Priorities: **P1** blocks a class of projects or silently misbehaves, **P2** forces consumers to
reimplement library internals, **P3** quality and clarity.

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| R1 | Rigid bodies collide with custom colliders | P1 | Done |
| R2 | Custom depth for `polygon3D` and `line3D` | P2 | Done |
| R3 | Cull geometry outside the view | P2 | Done |
| R4 | Fog by distance from the camera | P2 | Done |
| R5 | Bounded batch size in the rasterizer | P2 | Done (default 256) |
| R6 | Optional seam closing for flat polygons | P3 | Done |
| R7 | Honest render timing | P3 | Done |
| R8 | First-person controls and key edges | P3 | Done |
| R9 | Smaller API clarity fixes | P3 | Done |
| R10 | Backend-neutral custom nodes | P3 | Deferred |
| R11 | Run off the main thread | P2 | Part 1 done, part 2 open |

Every requirement marked Done has tests, and `npm run check` (typecheck, 194 tests, build) and `npm run perf`
pass. See [Implementation](#implementation) at the end.

## R1. Rigid bodies collide with custom colliders (P1)

**Problem.** `Collider` is a public interface, but the rigid pipeline only handles `PlaneCollider`,
`SphereCollider` and `BoxContainer` (`instanceof` checks in `rigidPipeline.ts` `collideCollider`). A custom
collider, such as voxel terrain, acts on particles through `solve()` while rigid bodies silently fall
through it. Craft could not let rigid bodies rest on its terrain.

**Requirement.**
- `Collider` MUST gain an optional hook through which a collider reports fixed geometry near a rigid body:
  planes, axis-aligned boxes and spheres. The pipeline collides the body with each reported shape using
  the existing narrowphase, with the collider's `friction` and `restitution` (or the world's).
- Contacts with reported shapes MUST warm start like contacts with the built-in colliders, so bodies can
  rest and sleep on custom geometry.
- The `Collider` documentation MUST say that a collider without the hook does not affect rigid bodies.

**Acceptance.** A box, a sphere and a capsule dropped on a custom collider made of axis-aligned boxes come
to rest on top of it and fall asleep; a custom collider without the hook still lets them through; the
built-in colliders behave exactly as before (existing tests and budgets pass).

## R2. Custom depth for `polygon3D` and `line3D` (P2)

**Problem.** `EmitContext.polygon3D` always sorts a polygon at the average view depth of its corners.
For a grid of unit cubes that orders block tops and sides wrongly; the correct order sorts every face of a
block at the block's distance. Craft had to reimplement projection and near-plane clipping to push
polygons into the queue itself.

**Requirement.** `polygon3D` and `line3D` MUST accept an optional sort depth that replaces the computed one.
Calls without it MUST behave as before.

**Acceptance.** A test pushes a polygon and a line with an explicit depth and finds that depth in the queue;
without it the depth is unchanged.

## R3. Cull geometry outside the view (P2)

**Problem.** The software pipeline only drops geometry behind the near plane. Meshes and polygons off to the
sides are still transformed, shaded, queued, sorted and handed to the canvas. Craft added its own chunk and
on-screen culling.

**Requirement.**
- A `MeshNode` whose bounding sphere lies outside the view frustum MUST be skipped before its vertices are
  transformed. The bounding sphere MUST follow mesh changes (`Mesh.markDirty`).
- A projected polygon (meshes and `polygon3D`) that lies entirely outside one edge of the viewport MUST NOT be
  queued. Culled geometry counts in `RenderStats.culled`.

**Acceptance.** Tests: a mesh behind or beside the camera produces no primitives; a polygon fully off screen
is not queued; one partly on screen is. Demo budgets stay within their bounds.

## R4. Fog by distance from the camera (P2)

**Problem.** Fog fades by view depth (`z`), so the same distant hill is less fogged at the edge of the screen
than in the middle and the fog line moves as the camera turns. Craft passed `litStyle` a fake point straight
ahead at each face's distance to get distance fog.

**Requirement.** `Fog` MUST accept `mode: "depth" | "distance"` (default `"depth"`, the current behavior).
In `"distance"` mode every fogged primitive (lit and unlit faces, smooth shading, spheres, points, lines)
MUST use its distance from the camera.

**Acceptance.** Tests: in distance mode a point off to the side gets the fog of its distance, not of its
depth; depth mode is unchanged.

## R5. Bounded batch size in the rasterizer (P2)

**Problem.** The rasterizer draws each run of one style as a single path. Chrome fills one path of many
overlapping polygons disproportionately slowly. Measured on Craft's 96-block view with every face forced to
one style (draw plus finish, ms):

| Most primitives per batch | 16 | 64 | 256 | 1024 | 4096 | unlimited |
| --- | --- | --- | --- | --- | --- | --- |
| Time | 20 | 23 | 23 | 36 | 99 | ~347 |

**Requirement.** The rasterizer MUST split batches longer than a configurable maximum. The default MUST be
chosen by measurement on both a polygon-heavy and a circle-heavy scene, so that no measured scene gets
slower. Any change to the demo budgets MUST be deliberate and explained.

**Acceptance.** A test finds no batch longer than the maximum; measurements recorded with the change.

## R6. Optional seam closing for flat polygons (P3)

**Problem.** Neighboring polygons drawn in different batches leave anti-aliased hairlines where the
background shows through. The library closes these only for gradient triangles (`SEAM` in `emit.ts`); Craft
grew every quad by 0.4 px itself.

**Requirement.** The renderer MUST offer an option (off by default, so output stays exactly as it is) that
grows opaque filled polygons by a given number of pixels around their center. Translucent polygons MUST NOT
be grown, since overlaps would show as darker lines.

**Acceptance.** Tests: with the option an opaque polygon grows by the amount, a translucent one does not;
without it nothing changes.

## R7. Honest render timing (P3)

**Problem.** `RenderStats.ms` and `SimulationStats.renderMs` measure only the CPU time to emit, sort and
issue canvas calls; the canvas fills pixels afterwards. Measured in Craft: 2.0 ms reported against 8.9 ms
with the canvas forced to finish (48-block view), 7.6 ms against 24.9 ms (96-block view). A HUD showing
"render ms" misleads.

**Requirement.** The documentation of both stats MUST say what they measure. `Canvas2DBackend` MUST offer an
opt-in debug option that waits for the canvas to finish and reports that time separately, documented with
its cost.

**Acceptance.** With the option the backend reports a finish time and includes it in `ms`; without it
nothing changes.

## R8. First-person controls and key edges (P3)

**Problem.** There are orbit controls but no first-person controls; Craft wrote pointer lock, mouse look and
a drag fallback (pointer lock is refused in some embedded or automated browsers) itself. `KeyboardState`
reports only held keys, so "pressed this frame" (hotbar keys, toggles) needs separate listeners. The
`keyboard` option of `Simulation` takes the keys whose browser default is prevented, which its name doesn't
suggest.

**Requirement.**
- A `FirstPersonControls` class: click to capture the pointer, yaw and pitch from mouse movement with a
  pitch limit, release with Esc, drag-to-look fallback when pointer lock is refused, mouse buttons reported
  as presses and releases while active, and the camera rotation applied every frame. `Simulation` MUST
  accept it as an option like `orbit` (and then not create orbit controls).
- `KeyboardState.wasPressed(code)`: whether the key went down since the previous frame; `Simulation` ends
  the frame for it.
- `Simulation`'s `keyboard` option MUST also accept `{ preventDefault: [...] }`; the array form keeps working.

**Acceptance.** Tests for key edges and for the controls' yaw, pitch, clamping and camera rotation.

## R9. Smaller API clarity fixes (P3)

- `SceneOptions.ambient` sets the ambient intensity, and the docs say that the ambient light is not part of
  `scene.lights` (replacing `lights` keeps it).
- The documentation of `EmitContext.litStyle` says what the point is used for (fog, positional lights,
  highlights).
- The 10 bits of style id in the depth-sorted sort key only break ties between equal depths; the comment
  says so. No change in behavior.

## R10. Backend-neutral custom nodes (P3, deferred)

**Problem.** `CustomNode.emit` receives the software pipeline's `EmitContext`. The README plans a WebGL
backend; it could not draw custom nodes such as Craft's without its own emit path.

**Requirement.** Before a second backend lands, decide how custom nodes draw on it: either an `EmitContext`
that every backend implements, or custom nodes that produce meshes and primitives a backend can upload.

**Status.** Deferred: it belongs to the design of the WebGL backend, and a speculative interface now would
likely be wrong.

## R11. Run off the main thread (P2)

**Problem.** Everything runs on the page's main thread: physics, emit, sort and canvas calls. Physics-heavy
scenes (the cube pile spends about 13 ms per frame on physics) stall input and page UI for that long.
Craft's chunk generation (about 0.65 ms per chunk) also runs there.

What a worker does and doesn't buy, measured in Craft at a 48-block view: emit 0.8 ms, sort 0.1 ms, canvas
calls 1.1 ms, and 6.9 ms of the browser filling pixels. A worker frees the main thread but makes no frame
cheaper: the pixel filling dominates and a worker can't speed it up.

**Requirement.**
1. `Canvas2DBackend` MUST draw on an `OffscreenCanvas`, and `Simulation` and its frame loop MUST run in a
   worker without a DOM, so a whole simulation can move to a worker.
2. Physics in a worker of its own, with the typed arrays shared with the rendering thread, so physics and
   rendering run in parallel. This changes how objects, the world and the renderer share state
   (`SharedArrayBuffer` needs a cross-origin isolated page), and needs a design of its own.

**Part 2 in detail: alternating buffers between two threads.** Chrome already paints frame N (in its GPU
process) while JavaScript computes frame N+1, so double buffering inside one thread gains nothing. Measured in
Craft at a 96-block view, with busy-waiting added as stand-in game logic:

| Extra logic per frame | JS per frame | JS + painting, back to back | Actual frame rate |
| --- | --- | --- | --- |
| none | 4.8 ms | 14.1 ms | 60 fps |
| 8 ms | 12.7 ms | 22.2 ms | 60 fps |
| 11 ms | 16.0 ms | 25.3 ms | 30 fps |

22 ms of serial work still ran at 60 fps; what drops the frame rate is the JS thread passing ~16 ms. Splitting
physics and rendering over two threads with alternating buffers addresses exactly that: the physics thread
steps frame N+1 into one buffer while the render thread draws frame N from the other, and a frame costs the
larger of the two instead of their sum (11 ms against 5 ms in the last row: 60 fps again), for one frame of
added latency.

**Acceptance.** Part 1: a simulation started in a module worker draws on a transferred canvas. Part 2: open.

**Status.** Part 1 done; part 2 open, not started. For Craft, generating chunks in a worker is an application
change and needs nothing from the library.

## Implementation

| ID | What changed | Tests |
| --- | --- | --- |
| R1 | `Collider.rigidShapes(x, y, z, radius, out)` with `StaticShapeSink` (`plane`, `box`, `sphere`), plus optional `friction` and `restitution`. The rigid pipeline collides each awake dynamic body with the reported shapes through the existing narrowphase; all of a collider's contacts share one warm-start key and match by their point on the body. | `tests/physics/customCollider.test.ts` |
| R2 | Optional last argument `depth` on `EmitContext.polygon3D` and `line3D`. | `tests/rendering/culling.test.ts` |
| R3 | `Mesh.boundingSphere()` (cached by `version`). `SoftwareEmitter` skips meshes whose sphere lies outside the frustum, scaled by the node's transform, and drops projected polygons and smooth faces entirely off one edge of the viewport, before shading them. | `tests/rendering/culling.test.ts` |
| R4 | `Fog.mode: "depth" \| "distance"`; `Lighting.fogDepth()` and `fogAt()` used by every fogged primitive (faces, smooth corners, flat and lit spheres, points, lines, mesh edges). | `tests/rendering/fog.test.ts` |
| R5 | `Rasterizer.maxBatch`, default 256, and the `Canvas2DBackend` option `maxBatch`. The queue's logical batches are unchanged; the rasterizer splits them when drawing. | `tests/rendering/rasterizer.test.ts` |
| R6 | `RenderQueue.seam` and the `Canvas2DBackend` option `seam` (default 0): opaque filled polygons grow around their center, translucent ones and outlines never. | `tests/rendering/backend.test.ts` |
| R7 | Documented what `RenderStats.ms` and `SimulationStats` measure; the `Canvas2DBackend` option `syncTiming` reports `stats.finishMs`. | `tests/rendering/backend.test.ts` |
| R8 | `FirstPersonControls` (pointer lock, drag fallback, `onButton`, `forward()` and `right()`), the `Simulation` option `firstPerson` (then no orbit controls), `KeyboardState.wasPressed()` and `endFrame()` called by `Simulation`, and `keyboard: { preventDefault }`. | `tests/framework/controls.test.ts` |
| R9 | `SceneOptions.ambient`; docs on `scene.ambient` and `lights`, on `litStyle`, and on the style bits of the sort key. | `tests/framework/controls.test.ts` |
| R11.1 | `Canvas2DBackend` takes `HTMLCanvasElement \| OffscreenCanvas` (auto-resize only for elements); `startLoop` falls back to a timer where a worker has no `requestAnimationFrame`. | `tests/rendering/backend.test.ts`; checked by hand in Chrome with a module worker |

The README documents all of it, and its new examples are type-checked in `tests/readmeExamples.ts`.

### R5 measurements

Chrome at 1536×711, median milliseconds to draw and finish a frame, with the batch cap changed between runs:

| Scene | unlimited | 1024 | 256 | 64 |
| --- | --- | --- | --- | --- |
| Cube container, 1,000 spheres | 1.3 | 1.4 | 1.2 | 1.3 |
| Cube container after "Pile 2000" | 3.7 | 3.4 | 3.1 | 4.2 |
| Flow field, 8,000 points | 7.6 | 6.9 | 6.6 | 6.0 |
| Gravitation | 1.3 | 1.3 | 1.2 | 1.3 |
| Rigid bodies after pouring 300 particles | 8.9 | 8.5 | 8.4 | 8.3 |
| Craft, 14,600 faces in one style | ~347 | 36 | 23 | 23 |

256 is never slower than unlimited; 64 is slower on the sphere pile.

### Budget changes

`perf/budgets.json` was re-recorded for the work counters only; the timing baselines in `perf/baseline.json`
are untouched. Every change comes from this work:

| Scenario | Counter | Before | After | Why |
| --- | --- | --- | --- | --- |
| cube-pile-accurate | batches, beginPaths | 40 | 43 | R5 batch cap |
| cube-pile-sandbox | batches, beginPaths | 38 | 44 | R5 batch cap |
| flow-field | batches, beginPaths | 33 | 59 | R5 batch cap |
| lighting | primitives / batches / path commands | 2157 / 1429 / 6961 | 2095 / 1392 / 6750 | R3 off-screen culling |
| rigid-bodies | primitives / batches / path commands | 1355 / 786 / 4314 | 1277 / 722 / 4065 | R3 off-screen culling |

Physics counters (pairs, broadphase tests, bodies) are unchanged in every scenario. `npm run perf` passes
against the existing baselines, with frame times 0.97–1.05 of the baseline.

### Found along the way

- **Restitution loses more energy than its value suggests.** A sphere of radius 0.2 dropped from a height of
  2 m (center) onto a `PlaneCollider` with restitution 0.8 bounces its center back up to about 0.39 m: 0.19 m of
  rebound after a 1.8 m fall, an effective restitution of about 0.32 instead of 0.8.
  Custom colliders behave identically (the test compares them), so this is in the solver, not in R1. Likely
  suspects are the speculative margin and Baumgarte correction acting on the bounce; not changed here.
