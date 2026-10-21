import { Rasterizer, SoftwareEmitter, type Canvas2DLike, type PerspectiveCamera, type Scene, type Vec3, type World } from "projector";

/** A DOM-free replica of a demo: its world and scene, a fixed camera pose and scripted input. */
export interface ScenarioInstance {
  world: World;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Scripted input and other per-frame demo work before the physics step. */
  update?(dt: number, time: number): void;
  /** Per-frame demo work after the physics step (mesh sync, trails). */
  afterStep?(dt: number, time: number): void;
}

export interface Scenario {
  name: string;
  create(): ScenarioInstance;
}

/** Canvas size in CSS pixels used by every benchmark. */
export const WIDTH = 1280;
export const HEIGHT = 720;
export const DT = 1 / 60;

const forward: Vec3 = { x: 0, y: 0, z: 0 };

/** Places the camera like OrbitControls does, without a DOM element. */
export function orbitCamera(camera: PerspectiveCamera, target: Vec3, distance: number, yaw = 0, pitch = 0): void {
  camera.setYawPitch(yaw, pitch);
  camera.getForward(forward);
  camera.position = {
    x: target.x - forward.x * distance,
    y: target.y - forward.y * distance,
    z: target.z - forward.z * distance,
  };
}

/** Accepts every draw call and counts them; the rasterizer's JS cost without the browser's. */
export class CountingContext implements Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000";
  lineWidth: number = 1;
  globalAlpha: number = 1;
  beginPaths: number = 0;
  fills: number = 0;
  strokes: number = 0;
  pathCommands: number = 0;

  reset(): void {
    this.beginPaths = 0;
    this.fills = 0;
    this.strokes = 0;
    this.pathCommands = 0;
  }

  beginPath(): void {
    this.beginPaths++;
  }

  moveTo(): void {
    this.pathCommands++;
  }

  lineTo(): void {
    this.pathCommands++;
  }

  closePath(): void {}

  arc(): void {
    this.pathCommands++;
  }

  rect(): void {
    this.pathCommands++;
  }

  fill(): void {
    this.fills++;
  }

  stroke(): void {
    this.strokes++;
  }
}

/** Runs a scenario frame by frame in the same order as the demos: input, physics, demo work, render. */
export class Runner {
  readonly instance: ScenarioInstance;
  readonly emitter: SoftwareEmitter = new SoftwareEmitter();
  readonly rasterizer: Rasterizer = new Rasterizer();
  readonly ctx: CountingContext = new CountingContext();
  time: number = 0;
  batches: number = 0;
  /** Milliseconds of the last frame: physics, update (input + demo work), emit (+ sort), raster, total. */
  readonly times: Float64Array = new Float64Array(5);

  constructor(scenario: Scenario) {
    this.instance = scenario.create();
  }

  frame(): void {
    const { instance, emitter, rasterizer, ctx, times } = this;
    this.time += DT;
    const t0 = performance.now();
    instance.update?.(DT, this.time);
    const t1 = performance.now();
    instance.world.step(DT);
    const t2 = performance.now();
    instance.afterStep?.(DT, this.time);
    const t3 = performance.now();
    instance.camera.aspect = WIDTH / HEIGHT;
    emitter.emitScene(instance.scene, instance.camera, WIDTH, HEIGHT);
    emitter.queue.sort();
    const t4 = performance.now();
    rasterizer.reset();
    ctx.reset();
    this.batches = rasterizer.draw(ctx, emitter.queue);
    const t5 = performance.now();
    times[0] = t2 - t1;
    times[1] = t1 - t0 + (t3 - t2);
    times[2] = t4 - t3;
    times[3] = t5 - t4;
    times[4] = t5 - t0;
  }

  run(frames: number): void {
    for (let f = 0; f < frames; f++) this.frame();
  }
}

export interface Timing {
  median: number;
  p95: number;
}

export interface TimingResult {
  frames: number;
  /** world.step */
  physicsMs: Timing;
  /** Scripted input and demo work around the step */
  updateMs: Timing;
  /** emitScene + sort */
  emitMs: Timing;
  /** Rasterizer.draw into a counting context */
  rasterMs: Timing;
  frameMs: Timing;
}

export const TIMINGS = ["physicsMs", "updateMs", "emitMs", "rasterMs", "frameMs"] as const;

function stat(samples: Float64Array, column: number, frames: number): Timing {
  const values = new Float64Array(frames);
  for (let f = 0; f < frames; f++) values[f] = samples[f * 5 + column];
  values.sort();
  const at = (q: number): number => values[Math.min(frames - 1, Math.floor(q * (frames - 1)))];
  return { median: at(0.5), p95: at(0.95) };
}

/** Times `frames` frames after `warmup` unmeasured ones (so the JIT has settled). */
export function measure(scenario: Scenario, frames: number, warmup: number = 60): TimingResult {
  const r = new Runner(scenario);
  r.run(warmup);
  const samples = new Float64Array(frames * 5);
  for (let f = 0; f < frames; f++) {
    r.frame();
    samples.set(r.times, f * 5);
  }
  const out = { frames } as TimingResult;
  TIMINGS.forEach((k, column) => (out[k] = stat(samples, column, frames)));
  return out;
}

export interface Counters {
  frames: number;
  /** Maxima over all frames. */
  primitives: number;
  batches: number;
  beginPaths: number;
  pathCommands: number;
  pairs: number;
  candidateTests: number;
  /** Final values. */
  bodies: number;
  finite: boolean;
}

function allFinite(world: World): boolean {
  const s = world.bodies;
  for (let i = 0; i < s.count * 3; i++) {
    if (!Number.isFinite(s.pos[i]) || !Number.isFinite(s.vel[i])) return false;
  }
  return true;
}

/** Deterministic work counters: identical on every machine for the same code. */
export function count(scenario: Scenario, frames: number): Counters {
  const r = new Runner(scenario);
  const c: Counters = {
    frames,
    primitives: 0,
    batches: 0,
    beginPaths: 0,
    pathCommands: 0,
    pairs: 0,
    candidateTests: 0,
    bodies: 0,
    finite: true,
  };
  for (let f = 0; f < frames; f++) {
    r.frame();
    const w = r.instance.world;
    c.primitives = Math.max(c.primitives, r.emitter.queue.count);
    c.batches = Math.max(c.batches, r.batches);
    c.beginPaths = Math.max(c.beginPaths, r.ctx.beginPaths);
    c.pathCommands = Math.max(c.pathCommands, r.ctx.pathCommands);
    c.pairs = Math.max(c.pairs, w.stats.pairs);
    c.candidateTests = Math.max(c.candidateTests, w.broadphase.stats.candidateTests);
  }
  c.bodies = r.instance.world.bodies.count;
  c.finite = allFinite(r.instance.world);
  return c;
}
