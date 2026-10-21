import { kineticEnergy } from "projector";
import { startDemo } from "../shared/page.js";
import { config, setup } from "./setup.js";

const { sim, hud, demo } = startDemo(config, setup);

const row = hud.row();
hud.button("Reset", () => demo.reset(), row);
hud.button("+200 bodies", () => demo.addDisk(200, 3.4, 4.2), row);
hud.slider("G", 0.2, 3, 0.1, demo.gravity.G, (g) => (demo.gravity.G = g));
hud.slider("time scale", 0.1, 2, 0.05, sim.world.timeScale, (t) => (sim.world.timeScale = t));

sim.onAfterRender(() => {
  const s = sim.world.stats;
  hud.stat("bodies", s.bodies);
  hud.stat("physics ms", s.stepMs);
  hud.stat("contact pairs", s.pairs);
  hud.stat("kinetic energy", kineticEnergy(sim.world.bodies));
});
