import { PointerDrag } from "projector";
import { startDemo } from "../shared/page.js";
import { config, setup } from "./setup.js";

const { sim, hud, demo } = startDemo(config, setup, (demo) => ({
  // ?bench: spin the box by "dragging" for a second, then shake it
  benchScript: (frame) => {
    if (frame >= 30 && frame < 90) {
      demo.drag.x += 6;
      demo.drag.y += 2;
    }
    if (frame === 240) demo.shake();
  },
}));

new PointerDrag(sim.canvas!, (dx, dy) => {
  demo.drag.x += dx;
  demo.drag.y += dy;
});

const world = sim.world;
const buttons = hud.row();
hud.button("+1000 spheres", () => demo.spawn(1000), buttons);
hud.button("Pile 2000", () => demo.pile(2000), buttons);
const more = hud.row();
hud.button("Shake", () => demo.shake(), more);
hud.button("Reset", () => demo.reset(), more);
hud.select("broadphase", ["accurate", "sandbox"] as const, world.broadphase.mode, (m) => (world.broadphase.mode = m));
hud.slider("time scale", 0.1, 2, 0.05, world.timeScale, (v) => (world.timeScale = v));
hud.slider("restitution", 0, 1, 0.05, world.restitution, (v) => (world.restitution = v));

sim.onAfterRender(() => {
  const s = world.stats;
  hud.stat("bodies", s.bodies);
  hud.stat("substeps", s.substeps);
  hud.stat("physics ms", s.stepMs);
  hud.stat("contact pairs", s.pairs);
  const b = world.broadphase.stats;
  hud.stat("max bucket", b.maxBucket);
  hud.stat("crowded buckets", b.overloadedBuckets);
  hud.stat("skipped (sandbox)", b.droppedBodies);
});
