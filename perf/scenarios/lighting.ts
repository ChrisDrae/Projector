import { config, setup } from "../../demos/lighting/setup.js";
import { createSimulation } from "../../demos/shared/config.js";
import type { Scenario } from "../harness.js";

export const lighting: Scenario = {
  name: "lighting",
  create(backend) {
    const sim = createSimulation(config, { backend });
    setup(sim);
    return sim;
  },
};
