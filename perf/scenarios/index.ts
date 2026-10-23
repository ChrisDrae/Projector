import type { Scenario } from "../harness.js";
import { cloth } from "./cloth.js";
import { cubeContainer, cubePileAccurate, cubePileSandbox } from "./cube.js";
import { flowField } from "./flowField.js";
import { gravitation } from "./gravitation.js";
import { lighting } from "./lighting.js";
import { rigidBodies } from "./rigidBodies.js";

export const scenarios: Scenario[] = [
  cubeContainer,
  cubePileAccurate,
  cubePileSandbox,
  gravitation,
  cloth,
  flowField,
  lighting,
  rigidBodies,
];
