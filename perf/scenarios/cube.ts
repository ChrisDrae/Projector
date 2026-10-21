import type { BroadphaseMode } from "projector";
import { config, setup, type CubeDemo } from "../../demos/cube-container/setup.js";
import { createSimulation } from "../../demos/shared/config.js";
import type { Scenario } from "../harness.js";

interface CubeOptions {
  /** Bodies dropped on a single point at the start ("Pile 2000"). */
  pile?: number;
  mode?: BroadphaseMode;
}

function cube(name: string, options: CubeOptions): Scenario {
  return {
    name,
    create(backend) {
      const sim = createSimulation(config, { backend });
      if (options.mode) sim.world.broadphase.mode = options.mode;
      let demo: CubeDemo | null = null;
      let shaken = false;
      // Scripted input, registered before the demo's own update so it is read in the same frame:
      // drag the box into a spin, move it with the "arrow keys", then shake it
      sim.onUpdate(() => {
        if (!demo) return;
        const t = sim.time;
        if (t >= 0.5 && t < 1.5) {
          demo.drag.x = 6;
          demo.drag.y = 2;
        }
        demo.move.x = t >= 3 && t < 3.5 ? 1 : t >= 3.5 && t < 4 ? -1 : 0;
        demo.move.y = t >= 4 && t < 4.5 ? 1 : t >= 4.5 && t < 5 ? -1 : 0;
        if (t >= 6 && !shaken) {
          demo.shake();
          shaken = true;
        }
      });
      demo = setup(sim);
      if (options.pile) demo.pile(options.pile);
      return sim;
    },
  };
}

export const cubeContainer: Scenario = cube("cube-container", {});
export const cubePileAccurate: Scenario = cube("cube-pile-accurate", { pile: 2000, mode: "accurate" });
export const cubePileSandbox: Scenario = cube("cube-pile-sandbox", { pile: 2000, mode: "sandbox" });
