import { startDemo } from "../shared/page.js";
import { config, setup } from "./setup.js";

const { sim, hud, demo } = startDemo(config, setup);

hud.select("curved shading", ["smooth", "flat"] as const, "smooth", (s) => {
  for (const m of demo.curved) m.shading = s;
});
hud.select("shadows", ["on", "off"] as const, "on", (v) => demo.setShadows(v === "on"));
hud.select("fog", ["off", "on"] as const, "off", (v) => demo.setFog(v === "on"));
hud.slider("spot light", 0, 10, 0.5, demo.spot.intensity, (v) => (demo.spot.intensity = v));
hud.slider("lamps", 0, 4, 0.1, demo.lamps[0].intensity, (v) => {
  for (const l of demo.lamps) l.intensity = v;
});
hud.slider("key light", 0, 1.5, 0.05, demo.key.intensity, (v) => (demo.key.intensity = v));
hud.slider("specular", 0, 1, 0.05, demo.shiny[0].specular, (v) => {
  for (const m of demo.shiny) m.specular = v;
});

sim.onAfterRender(() => {
  hud.stat("lights", sim.scene.lights.length + 1);
});
