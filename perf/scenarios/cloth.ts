import { config, setup } from "../../demos/cloth/setup.js";
import { createSimulation } from "../../demos/shared/config.js";
import type { Scenario } from "../harness.js";

export const cloth: Scenario = {
  name: "cloth",
  create(backend) {
    const sim = createSimulation(config, { backend });
    setup(sim);
    return sim;
  },
};
