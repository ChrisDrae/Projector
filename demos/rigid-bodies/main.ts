import { startDemo } from "../shared/page.js";
import { config, setup, type ShotKind } from "./setup.js";

const { sim, hud, demo } = startDemo(config, setup, (demo) => ({
  // ?bench: throw a few balls into the pyramid, then pour particles
  benchScript: (frame) => {
    if (frame % 30 === 0 && frame <= 150) {
      demo.shoot({ x: 1.5, y: 1.5, z: -5 }, { x: -0.25, y: -0.1, z: 0.96 }, "sphere");
    }
    if (frame === 200) demo.pour(300);
  },
}));

let shot: ShotKind = "sphere";
const canvas = sim.canvas!;
let down: { x: number; y: number } | null = null;
// A click (not a drag) shoots along the ray under the pointer
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 0) down = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerup", (e) => {
  if (e.button !== 0 || !down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 4) return;
  const rect = canvas.getBoundingClientRect();
  const origin = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, y: 0, z: 0 };
  sim.camera.screenToRay(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, origin, dir);
  demo.shoot(origin, dir, shot);
});

const row = hud.row();
hud.button("Reset", () => demo.reset(), row);
hud.button("Drop 12", () => demo.drop(12), row);
hud.button("Pour 300", () => demo.pour(300), row);
hud.select("shoot", ["sphere", "box", "capsule"] as const, shot, (k) => (shot = k));
hud.slider("time scale", 0.1, 2, 0.05, sim.world.timeScale, (v) => (sim.world.timeScale = v));

sim.onAfterRender(() => {
  const s = sim.world.stats;
  const r = sim.world.rigidPipeline.stats;
  hud.stat("rigid bodies", s.rigidBodies);
  hud.stat("contacts", s.rigidContacts);
  hud.stat("sleeping", r.sleeping);
  hud.stat("particles", s.bodies);
  hud.stat("physics ms", s.stepMs);
});
