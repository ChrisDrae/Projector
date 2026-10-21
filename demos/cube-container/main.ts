import { Cube } from "../../src/objects/cube.js";
import { RendererEngine } from "../../src/rendering/renderer.js";
import Circle from "../../src/objects/circle.js";
import { CollisionSystem } from "../../src/physics/collision.js";
import { SpatialGrid } from "../../src/utility/partitioning.js";

const canvasElement = document.getElementById("canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element with id 'canvas' was not found.");
}

const BACKGROUND = "#333131";

const canvas = canvasElement;
canvas.width = 800;
canvas.height = 800;
canvas.style.width = "800px";
canvas.style.height = "800px";
canvas.style.margin = "calc(50vh - 400px) auto 0";

const FPS = 60;

const ctx = canvas.getContext("2d");

if (!ctx) {
  throw new Error("Unable to get a 2D rendering context for the canvas.");
}

const context: CanvasRenderingContext2D = ctx;

const r = new RendererEngine({
  ctx: context,
  background: BACKGROUND,
  dimensions: [canvas.width, canvas.height],
});

const cubi = new Cube(0.5, { x: 0, y: 0.4, z: 0.2 });

cubi.addKeycontrol();
cubi.addMouseDragRotate();

const circles: Array<Circle> = [];

const Radius = 0.003;

const h = cubi.dimension / 2;
const amount = 1000;

for (let i = 0; i < amount; i++) {
  const x = cubi.position.x + (Math.random() * 2 - 1) * (h - Radius);
  const y = cubi.position.y + (Math.random() * 2 - 1) * (h - Radius);
  const z = cubi.position.z + (Math.random() * 2 - 1) * (h - Radius);
  circles[i] = new Circle({ x, y, z }, Radius);
}

let measuredFPS = FPS;

const grid = new SpatialGrid(Radius * 2);

function frame(): void {
  const start = performance.now();
  const dt = 1 / measuredFPS;
  r.clear();

  for (const c of circles) {
    c.applyForce({ x: 0, y: -9.8 * c.mass, z: 0 });
    c.integrate(dt);
  }

  CollisionSystem.resolveAll(circles, cubi, grid, 0.3);

  for (const c of circles) {
    c.resizeToDistanceZ();
    r.drawCircle(c, "rgb(160, 212, 91)");
  }

  r.drawCube(cubi);
  r.drawYPlane();

  const end = performance.now();
  measuredFPS = 1000 / (end - start);
  requestAnimationFrame(frame);
}

r.clear();
requestAnimationFrame(frame);
