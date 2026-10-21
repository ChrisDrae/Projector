import { KeyboardState } from "../controls/keyboard.js";
import { OrbitControls, placeOrbitCamera, type OrbitControlsOptions } from "../controls/orbitControls.js";
import type { Vec3 } from "../math/vec3.js";
import { World, type RaycastHit, type WorldOptions } from "../physics/world.js";
import type { RenderBackend } from "../rendering/backend.js";
import { Canvas2DBackend } from "../rendering/canvas2d/canvas2dBackend.js";
import { PerspectiveCamera, type PerspectiveCameraOptions } from "../scene/camera.js";
import { Scene, type SceneOptions } from "../scene/scene.js";
import { FpsCounter, startLoop, type Loop } from "../utility/loop.js";
import { SimObject } from "./simObject.js";

export interface SimulationOptions {
  /** Canvas to draw on. Without one (and without a backend) the simulation runs headless. */
  canvas?: HTMLCanvasElement | null;
  /** Renderer; defaults to a Canvas2DBackend on the canvas. */
  backend?: RenderBackend | null;
  world?: World | WorldOptions;
  scene?: Scene | SceneOptions;
  camera?: PerspectiveCamera | PerspectiveCameraOptions;
  /**
   * Orbit camera: drag to rotate, wheel to zoom (with a canvas), or just the initial camera pose when
   * headless. false leaves the camera alone. Default {} with a canvas, false without.
   */
  orbit?: OrbitControlsOptions | false;
  /** Keys whose browser default (scrolling) is prevented; false for no keyboard. Needs a canvas. */
  keyboard?: readonly string[] | false;
}

export interface SimulationStats {
  /** Smoothed frames per second. */
  fps: number;
  /** Milliseconds of the last frame: everything, updates (before and after physics), physics, render. */
  frameMs: number;
  updateMs: number;
  physicsMs: number;
  renderMs: number;
  substeps: number;
  bodies: number;
  primitives: number;
  batches: number;
}

export type FrameListener = (dt: number, sim: Simulation) => void;

const DEFAULT_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Space"];

/**
 * The runtime that ties physics, scene and rendering together. Each frame:
 * 1. onUpdate listeners, then update() on every object
 * 2. world.step(dt) in fixed steps; each step runs onFixedUpdate listeners and fixedUpdate() first
 * 3. sync() on every object (physics -> transforms, meshes), then world matrices
 * 4. render, then onAfterRender listeners
 *
 * Add objects with add(); everything an object owns is cleaned up when it is removed. The world, scene
 * and camera stay public for anything the objects don't cover. Without a canvas the simulation is
 * headless (tests, benchmarks, Node): call frame(dt) yourself.
 */
export class Simulation {
  readonly world: World;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement | null;
  readonly backend: RenderBackend | null;
  /** Parent of every object added with add(). */
  readonly root: SimObject;
  readonly orbit: OrbitControls | null;
  readonly keyboard: KeyboardState | null;
  readonly stats: SimulationStats = {
    fps: 0,
    frameMs: 0,
    updateMs: 0,
    physicsMs: 0,
    renderMs: 0,
    substeps: 0,
    bodies: 0,
    primitives: 0,
    batches: 0,
  };
  /** While paused, frames still update, sync and render, but physics does not advance. */
  paused: boolean = false;
  /** Seconds of frame time since the first frame (simulated time is world.time). */
  time: number = 0;
  private loop: Loop | null = null;
  private readonly fps: FpsCounter = new FpsCounter();
  private readonly updateListeners: FrameListener[] = [];
  private readonly fixedListeners: FrameListener[] = [];
  private readonly renderListeners: FrameListener[] = [];
  private readonly preventContextMenu = (e: Event): void => e.preventDefault();

  constructor(options: SimulationOptions = {}) {
    this.world = options.world instanceof World ? options.world : new World(options.world);
    this.scene = options.scene instanceof Scene ? options.scene : new Scene(options.scene);
    this.camera =
      options.camera instanceof PerspectiveCamera ? options.camera : new PerspectiveCamera(options.camera);
    this.canvas = options.canvas ?? null;
    this.backend = options.backend ?? (this.canvas ? new Canvas2DBackend(this.canvas) : null);

    const orbit = options.orbit ?? (this.canvas ? {} : false);
    if (orbit !== false && this.canvas) {
      this.orbit = new OrbitControls(this.camera, this.canvas, orbit);
      if (orbit.button === 2) this.canvas.addEventListener("contextmenu", this.preventContextMenu);
    } else {
      this.orbit = null;
      if (orbit !== false) {
        const target = orbit.target ?? { x: 0, y: 0, z: 0 };
        placeOrbitCamera(this.camera, target, orbit.distance ?? 1.5, orbit.yaw ?? 0, orbit.pitch ?? 0);
      }
    }
    const keys = options.keyboard ?? DEFAULT_KEYS;
    this.keyboard = this.canvas && keys !== false ? new KeyboardState(window, [...keys]) : null;

    this.root = new SimObject({ name: "root" });
    this.root.attach(this);
    this.world.onBeforeStep((dt) => {
      for (let i = 0; i < this.fixedListeners.length; i++) this.fixedListeners[i](dt, this);
      this.root.fixedUpdateTree(dt);
    });
  }

  /** Adds an object (to the root, or to a parent object) and returns it. */
  add<T extends SimObject>(object: T, parent: SimObject = this.root): T {
    return parent.addChild(object);
  }

  /** Removes an object and everything it owns. */
  remove(object: SimObject): void {
    object.parent?.removeChild(object);
  }

  /** Every frame before physics. Returns a function that removes the listener. */
  onUpdate(listener: FrameListener): () => void {
    return subscribe(this.updateListeners, listener);
  }

  /** Every fixed physics step, before forces. */
  onFixedUpdate(listener: FrameListener): () => void {
    return subscribe(this.fixedListeners, listener);
  }

  /** Every frame after rendering (stats, UI). */
  onAfterRender(listener: FrameListener): () => void {
    return subscribe(this.renderListeners, listener);
  }

  /** Advances one frame of `dt` seconds: updates, physics, sync, render. */
  frame(dt: number): void {
    const t0 = performance.now();
    this.time += dt;
    this.fps.update(dt);
    for (let i = 0; i < this.updateListeners.length; i++) this.updateListeners[i](dt, this);
    this.root.updateTree(dt);
    const t1 = performance.now();
    if (!this.paused) this.world.step(dt);
    const t2 = performance.now();
    this.root.syncTree(null, true);
    this.orbit?.update();
    const t3 = performance.now();
    if (this.backend) this.backend.render(this.scene, this.camera);
    const t4 = performance.now();

    const s = this.stats;
    s.fps = this.fps.fps;
    s.frameMs = t4 - t0;
    s.updateMs = t1 - t0 + (t3 - t2);
    s.physicsMs = t2 - t1;
    s.renderMs = t4 - t3;
    s.substeps = this.paused ? 0 : this.world.stats.substeps;
    s.bodies = this.world.bodies.count;
    s.primitives = this.backend ? this.backend.stats.primitives : 0;
    s.batches = this.backend ? this.backend.stats.batches : 0;
    for (let i = 0; i < this.renderListeners.length; i++) this.renderListeners[i](dt, this);
  }

  /** Runs frames on requestAnimationFrame with the real frame time. */
  start(): this {
    if (!this.loop) this.loop = startLoop((dt) => this.frame(dt));
    return this;
  }

  stop(): void {
    this.loop?.stop();
    this.loop = null;
  }

  get running(): boolean {
    return this.loop !== null;
  }

  /** What is under a point on the canvas (client coordinates, e.g. from a pointer event). */
  pick(clientX: number, clientY: number, maxDistance: number = Infinity): RaycastHit | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const origin: Vec3 = { x: 0, y: 0, z: 0 };
    const dir: Vec3 = { x: 0, y: 0, z: 0 };
    this.camera.screenToRay(clientX - rect.left, clientY - rect.top, rect.width, rect.height, origin, dir);
    return this.world.raycast(origin, dir, maxDistance);
  }

  /** Stops the loop, removes every object and releases input listeners and the renderer. */
  dispose(): void {
    this.stop();
    for (let i = this.root.children.length - 1; i >= 0; i--) this.root.removeChild(this.root.children[i]);
    this.orbit?.dispose();
    this.keyboard?.dispose();
    this.canvas?.removeEventListener("contextmenu", this.preventContextMenu);
    this.backend?.dispose();
  }
}

function subscribe<T>(list: T[], item: T): () => void {
  list.push(item);
  return () => {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  };
}
