import {
  Canvas2DBackend,
  FpsCounter,
  KeyboardState,
  OrbitControls,
  PerspectiveCamera,
  Scene,
  startLoop,
  type OrbitControlsOptions,
} from "projector";
import { BenchRecorder } from "./bench.js";
import { Hud } from "./hud.js";

export interface DemoOptions {
  title: string;
  help?: string;
  background?: string;
  fov?: number;
  near?: number;
  far?: number;
  orbit?: OrbitControlsOptions;
  /** Scripted input for `?bench` runs, called with the frame number before each frame. */
  benchScript?: (frame: number) => void;
}

export interface Demo {
  canvas: HTMLCanvasElement;
  backend: Canvas2DBackend;
  camera: PerspectiveCamera;
  scene: Scene;
  orbit: OrbitControls;
  keyboard: KeyboardState;
  hud: Hud;
  fps: FpsCounter;
  /** Starts the frame loop: `tick` updates the simulation, then the scene is rendered. */
  start(tick: (dt: number, time: number) => void): void;
}

export function createDemo(options: DemoOptions): Demo {
  const canvas = document.getElementById("canvas");
  const hudRoot = document.getElementById("hud");
  if (!(canvas instanceof HTMLCanvasElement) || !hudRoot) {
    throw new Error("Demo pages need a <canvas id=\"canvas\"> and a <div id=\"hud\">.");
  }
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const backend = new Canvas2DBackend(canvas);
  const camera = new PerspectiveCamera({ fov: options.fov, near: options.near, far: options.far });
  const scene = new Scene({ background: options.background });
  const orbit = new OrbitControls(camera, canvas, options.orbit);
  const keyboard = new KeyboardState(window, ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Space"]);
  const hud = new Hud(hudRoot, options.title, options.help);
  const fps = new FpsCounter();
  document.title = `Projector · ${options.title}`;

  return {
    canvas,
    backend,
    camera,
    scene,
    orbit,
    keyboard,
    hud,
    fps,
    start(tick) {
      const bench = BenchRecorder.fromLocation();
      startLoop((dt, time) => {
        fps.update(dt);
        if (bench && !bench.done) options.benchScript?.(bench.frame);
        const t0 = performance.now();
        tick(dt, time);
        orbit.update();
        const t1 = performance.now();
        backend.render(scene, camera);
        if (bench) {
          const summary = bench.record(dt, t1 - t0, backend.stats.ms);
          if (summary) hud.stat("bench", summary);
        }
        hud.stat("fps", Math.round(fps.fps));
        hud.stat("render ms", backend.stats.ms);
        hud.stat("primitives", backend.stats.primitives);
        hud.stat("draw batches", backend.stats.batches);
        hud.flush();
      });
    },
  };
}
