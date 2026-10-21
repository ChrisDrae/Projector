import { startDemo } from "../shared/page.js";
import { config, setup } from "./setup.js";

const { sim, hud, demo } = startDemo(config, setup);

const row = hud.row();
hud.button("Release pins", () => demo.cloth.release(), row);
hud.button("Reset", () => demo.cloth.reset(), row);
hud.slider("wind", 0, 5, 0.1, demo.wind.strength, (w) => (demo.wind.strength = w));

sim.onAfterRender(() => {
  hud.stat("particles", sim.world.bodies.count);
  hud.stat("constraints", demo.cloth.links?.count ?? 0);
  hud.stat("physics ms", sim.world.stats.stepMs);
});
