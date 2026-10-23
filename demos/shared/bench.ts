/**
 * `?bench` (or `?bench=900`) on a demo URL: after a short warm-up, records frame, update and render times
 * for a fixed number of frames, then logs a JSON summary to the console ("[bench] ...") and shows it in the
 * HUD. Used to compare real browser cost (the canvas included) before and after a change.
 */
export class BenchRecorder {
  readonly frames: number;
  readonly warmup: number = 60;
  frame: number = 0;
  done: boolean = false;
  private readonly dt: Float64Array;
  private readonly update: Float64Array;
  private readonly render: Float64Array;

  static fromLocation(): BenchRecorder | null {
    const value = new URLSearchParams(location.search).get("bench");
    if (value === null) return null;
    const frames = Number.parseInt(value, 10);
    return new BenchRecorder(Number.isFinite(frames) && frames > 0 ? frames : 600);
  }

  constructor(frames: number) {
    this.frames = frames;
    this.dt = new Float64Array(frames);
    this.update = new Float64Array(frames);
    this.render = new Float64Array(frames);
  }

  /** Returns the summary once the last frame has been recorded. */
  record(dt: number, updateMs: number, renderMs: number): string | null {
    if (this.done) return null;
    const i = this.frame++ - this.warmup;
    if (i < 0) return null;
    this.dt[i] = dt;
    this.update[i] = updateMs;
    this.render[i] = renderMs;
    if (i < this.frames - 1) return null;
    this.done = true;
    let total = 0;
    for (const d of this.dt) total += d;
    const summary = {
      demo: document.title,
      frames: this.frames,
      fps: Math.round((this.frames / total) * 10) / 10,
      frameMs: stats(this.dt, 1000),
      updateMs: stats(this.update, 1),
      renderMs: stats(this.render, 1),
    };
    const json = JSON.stringify(summary);
    console.log(`[bench] ${json}`);
    return json;
  }
}

function stats(values: Float64Array, scale: number): { median: number; p95: number } {
  const sorted = Float64Array.from(values).sort();
  const at = (q: number): number => Math.round(sorted[Math.floor(q * (sorted.length - 1))] * scale * 1000) / 1000;
  return { median: at(0.5), p95: at(0.95) };
}
