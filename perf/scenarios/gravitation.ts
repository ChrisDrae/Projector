import { config, setup } from "../../demos/gravitation/setup.js";
import { createSimulation } from "../../demos/shared/config.js";
import type { Scenario } from "../harness.js";

export const gravitation: Scenario = {
  name: "gravitation",
  create(backend) {
    const sim = createSimulation(config, { backend });
    setup(sim);
    return sim;
  },
};
