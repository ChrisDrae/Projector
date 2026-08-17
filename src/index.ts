import { Cube } from "./objects/cube.js";
import { Particle } from "./objects/particle.js";
import {
  RendererEngine,
  rotateAroundY,
  rotateAroundZ,
  toScreenCoordinates,
  translateZ,
} from "./rendering/renderer.js";
import { Vec } from "./objects/vectors";
import Circle from "./objects/circle.js";
import PerlinNoise from "./utility/perlin.js";

type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };
const center = { x: 0, y: 0, z: 0 };

const canvasElement = document.getElementById("canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element with id 'canvas' was not found.");
}

const BACKGROUND = "#333131";

const canvas = canvasElement;
canvas.width = 800;
canvas.height = 800;
const ratio = canvas.width / canvas.height;

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

let angle = 0;
let dz = 0;

const Cubi = new Cube(0.5);

const test = new Particle({ x: 0, y: 0, z: 0 }, 1);
Cubi.translate({ x: 0, y: 0.5, z: 0 });
Cubi.addKeycontrol();
Cubi.addMouseDragRotate();

const circle = new Circle({ x: 0.1, y: -0.1, z: 0 }, 10);
const circle2 = new Circle({ x: 0.1, y: 0.2, z: 0 }, 10);
const perlin = new PerlinNoise();
const interval = perlin.noise2D(0.3, 0) * 0.1;
const intervalY = perlin.noise2D(0.3, 1000) * 0.1;
let step = new Vec({ x: interval, y: intervalY, z: 0 });

const interval2 = perlin.noise2D(0.5, 10000) * 0.1;
const intervalY2 = perlin.noise2D(0.3, 1000) * 0.1;
let step2 = new Vec({ x: interval2, y: intervalY2, z: 0 });

function frame(): void {
  // Calculate differentials
  const dt = 1 / FPS;
  if (dz < 2) {
    dz += 1 * dt;
  }
  angle += (2 * Math.PI * dt) / 10;
  r.clear();
  // Animation need to be called strictly after clear()

  const hit2 = r.checkEdge(circle2.center, circle2.radius);
  const hit = r.checkEdge(circle.center, circle.radius);
  if (hit.x) step.x = -step.x;
  if (hit.y) step.y = -step.y;
  if (hit2.x) step2.x = -step2.x;
  if (hit2.y) step2.y = -step2.y;
  circle.move(step);
  circle2.move(step2)

  r.drawCircle(circle);
  r.drawCircle(circle2, "rgba(11, 223, 11, 0.84)")
  // Recursion
  setTimeout(frame, 1000 / FPS);
}

r.clear();
setTimeout(frame, 1000 / FPS);
