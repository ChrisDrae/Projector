export interface Loop {
  stop(): void;
  readonly running: boolean;
}

/**
 * Runs `tick` every animation frame with the real time since the previous frame (seconds), clamped to
 * `maxDt` so a background tab or a breakpoint doesn't produce one giant step.
 */
export function startLoop(tick: (dt: number, time: number) => void, maxDt: number = 0.1): Loop {
  let running = true;
  let last = -1;
  let time = 0;
  let handle = 0;

  const frame = (now: number): void => {
    if (!running) return;
    const dt = last < 0 ? 1 / 60 : Math.min((now - last) / 1000, maxDt);
    last = now;
    time += dt;
    tick(dt, time);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
      cancelAnimationFrame(handle);
    },
    get running(): boolean {
      return running;
    },
  };
}

/** Exponentially smoothed frames per second. */
export class FpsCounter {
  fps: number = 60;
  /** Smoothed frame time in milliseconds. */
  frameMs: number = 1000 / 60;
  smoothing: number;

  constructor(smoothing: number = 0.1) {
    this.smoothing = smoothing;
  }

  update(dt: number): number {
    if (dt <= 0) return this.fps;
    this.frameMs += (dt * 1000 - this.frameMs) * this.smoothing;
    this.fps = 1000 / this.frameMs;
    return this.fps;
  }
}
