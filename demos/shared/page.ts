import type { Simulation } from "projector";
import { BenchRecorder } from "./bench.js";
import { createSimulation, type DemoConfig } from "./config.js";
import { Hud } from "./hud.js";

export interface DemoPage<T> {
  sim: Simulation;
  hud: Hud;
  demo: T;
}

export interface DemoPageOptions {
  /** Scripted input for `?bench` runs, called with the frame number before each frame. */
  benchScript?: (frame: number) => void;
}

/**
 * Mounts a demo on the page: a Simulation on <canvas id="canvas">, its content from `setup`, a HUD in
 * <div id="hud"> with the frame stats, and the `?bench` recorder. Starts the frame loop.
 */
export function startDemo<T>(
  config: DemoConfig,
  setup: (sim: Simulation) => T,
  options: (demo: T) => DemoPageOptions = () => ({}),
): DemoPage<T> {
  const canvas = document.getElementById("canvas");
  const hudRoot = document.getElementById("hud");
  if (!(canvas instanceof HTMLCanvasElement) || !hudRoot) {
    throw new Error('Demo pages need a <canvas id="canvas"> and a <div id="hud">.');
  }
  document.title = `Projector · ${config.title}`;
  const sim = createSimulation(config, { canvas });
  const hud = new Hud(hudRoot, config.title, config.help);

  // Registered before the demo's own listeners, so they read the scripted input in the same frame
  const bench = BenchRecorder.fromLocation();
  let benchScript: ((frame: number) => void) | undefined;
  if (bench) {
    sim.onUpdate(() => {
      if (!bench.done) benchScript?.(bench.frame);
    });
  }
  const demo = setup(sim);
  benchScript = options(demo).benchScript;

  sim.onAfterRender((dt) => {
    const s = sim.stats;
    if (bench) {
      const summary = bench.record(dt, s.updateMs + s.physicsMs, s.renderMs);
      if (summary) hud.stat("bench", summary);
    }
    hud.stat("fps", Math.round(s.fps));
    hud.stat("render ms", s.renderMs);
    hud.stat("primitives", s.primitives);
    hud.stat("draw batches", s.batches);
    hud.flush();
  });
  sim.start();
  // For poking at the running demo from the browser console
  Object.assign(globalThis, { demo: { sim, demo, hud } });
  return { sim, hud, demo };
}
