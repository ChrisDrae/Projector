import { config, setup } from "../../demos/rigid-bodies/setup.js";
import { createSimulation } from "../../demos/shared/config.js";
import type { Scenario } from "../harness.js";

export const rigidBodies: Scenario = {
  name: "rigid-bodies",
  create(backend) {
    const sim = createSimulation(config, { backend });
    const demo = setup(sim);
    // Scripted input: balls thrown into the pyramid, then particles poured over the wreck
    let frame = 0;
    sim.onUpdate(() => {
      frame++;
      if (frame % 30 === 0 && frame <= 180) demo.shoot({ x: 1.5, y: 1.5, z: -5 }, { x: -0.25, y: -0.1, z: 0.96 }, "sphere");
      if (frame === 210) demo.pour(300);
    });
    return sim;
  },
};
