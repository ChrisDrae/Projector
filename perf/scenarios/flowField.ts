import { config, setup } from "../../demos/flow-field/setup.js";
import { createSimulation } from "../../demos/shared/config.js";
import type { Scenario } from "../harness.js";

export const flowField: Scenario = {
  name: "flow-field",
  create(backend) {
    const sim = createSimulation(config, { backend });
    setup(sim);
    return sim;
  },
};
