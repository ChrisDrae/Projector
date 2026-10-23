import {
  Simulation,
  type OrbitControlsOptions,
  type PerspectiveCameraOptions,
  type RenderBackend,
  type WorldOptions,
} from "projector";

/** Everything about a demo's simulation that isn't its content: shared by the page and the benchmarks. */
export interface DemoConfig {
  title: string;
  help: string;
  background: string;
  camera?: PerspectiveCameraOptions;
  orbit: OrbitControlsOptions;
  world?: WorldOptions;
}

/** A Simulation set up for a demo, drawing on a canvas (page) or into a given backend (benchmarks). */
export function createSimulation(
  config: DemoConfig,
  target: { canvas: HTMLCanvasElement } | { backend: RenderBackend },
): Simulation {
  return new Simulation({
    ...target,
    world: config.world,
    scene: { background: config.background },
    camera: config.camera,
    orbit: config.orbit,
  });
}
