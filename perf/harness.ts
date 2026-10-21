import {
  Rasterizer,
  SoftwareEmitter,
  type Canvas2DLike,
  type PerspectiveCamera,
  type RenderBackend,
  type RenderStats,
  type Scene,
  type Simulation,
} from "projector";

/**
 * A benchmark scenario: a demo's simulation (its own setup code) drawing into the given backend, with
 * scripted input instead of a user.
 */
export interface Scenario {
  name: string;
  create(backend: RenderBackend): Simulation;
}

/** Canvas size in CSS pixels used by every benchmark. */
export const WIDTH = 1280;
export const HEIGHT = 720;
export const DT = 1 / 60;

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

  createLinearGradient(): CanvasGradient {
    return GRADIENT;
  }
}

const GRADIENT = { addColorStop(): void {} } as unknown as CanvasGradient;

/** The Canvas2DBackend pipeline (emit, sort, rasterize) into a CountingContext, timing emit and raster. */
export class CountingBackend implements RenderBackend {
  readonly name: string = "counting";
  readonly stats: RenderStats = { primitives: 0, batches: 0, culled: 0, ms: 0 };
  readonly emitter: SoftwareEmitter = new SoftwareEmitter();
  readonly rasterizer: Rasterizer = new Rasterizer();
  readonly ctx: CountingContext = new CountingContext();
  emitMs: number = 0;
  rasterMs: number = 0;

  setSize(): void {}

  render(scene: Scene, camera: PerspectiveCamera): void {
    const t0 = performance.now();
    camera.aspect = WIDTH / HEIGHT;
    this.emitter.emitScene(scene, camera, WIDTH, HEIGHT);
    this.emitter.queue.sort();
    const t1 = performance.now();
    this.rasterizer.reset();
    this.ctx.reset();
    this.stats.batches = this.rasterizer.draw(this.ctx, this.emitter.queue);
    const t2 = performance.now();
    this.stats.primitives = this.emitter.queue.count;
    this.stats.culled = this.emitter.culled;
    this.emitMs = t1 - t0;
    this.rasterMs = t2 - t1;
    this.stats.ms = t2 - t0;
  }

  dispose(): void {}
}

/** Runs a scenario frame by frame through Simulation.frame, like the demo pages do. */
export class Runner {
  readonly backend: CountingBackend = new CountingBackend();
  readonly sim: Simulation;
  /** Milliseconds of the last frame: physics, update (input, objects, sync), emit (+ sort), raster, total. */
  readonly times: Float64Array = new Float64Array(5);

  constructor(scenario: Scenario) {
    this.sim = scenario.create(this.backend);
  }

  frame(): void {
    const t0 = performance.now();
    this.sim.frame(DT);
    const t1 = performance.now();
    const s = this.sim.stats;
    this.times[0] = s.physicsMs;
    this.times[1] = s.updateMs;
    this.times[2] = this.backend.emitMs;
    this.times[3] = this.backend.rasterMs;
    this.times[4] = t1 - t0;
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
  /** Scripted input, object updates and syncs around the step */
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

function allFinite(sim: Simulation): boolean {
  const s = sim.world.bodies;
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
    const w = r.sim.world;
    c.primitives = Math.max(c.primitives, r.backend.stats.primitives);
    c.batches = Math.max(c.batches, r.backend.stats.batches);
    c.beginPaths = Math.max(c.beginPaths, r.backend.ctx.beginPaths);
    c.pathCommands = Math.max(c.pathCommands, r.backend.ctx.pathCommands);
    c.pairs = Math.max(c.pairs, w.stats.pairs);
    c.candidateTests = Math.max(c.candidateTests, w.broadphase.stats.candidateTests);
  }
  c.bodies = r.sim.world.bodies.count;
  c.finite = allFinite(r.sim);
  return c;
}
