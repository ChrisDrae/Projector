import { startDemo } from "../shared/page.js";
import { config, setup } from "./setup.js";

const { sim, hud, demo } = startDemo(config, setup);

hud.slider("strength", 0, 15, 0.5, demo.field.strength, (v) => (demo.field.strength = v));
hud.slider("scale", 0.2, 3, 0.05, demo.params.scale, (v) => (demo.params.scale = v));
hud.slider("evolution", 0, 1, 0.05, demo.params.evolve, (v) => (demo.params.evolve = v));

sim.onAfterRender(() => {
  hud.stat("particles", sim.world.bodies.count);
  hud.stat("physics ms", sim.world.stats.stepMs);
});
