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


const circles: Array<Circle> = [];

const Radius = 0.04

const perlin = new PerlinNoise();
const interval = perlin.noise2D(0.3, 0.1) * 0.1;
const intervalY = perlin.noise2D(0.3, 1000.4) * 0.1;

let frames = 0;
for (let i = 0; i < 100; i++) {
  const tmp = i * 0.01;
  circles[i] = new Circle(
    { x: tmp * interval, y: intervalY  * 0.5, z: 0 },
    Radius,
  );
}

const steps: Array<Vec> = [];
const amount = 100;

for (let i = 0; i < amount; i++) {
  const rangeX = -0.025 + (Math.random() * 0.05)
  const rangeY = -0.025 + (Math.random() * 0.05)

  steps[i] = new Vec({ x: rangeX, y: rangeY, z: 0 });
}

function frame(): void {
  // Calculate differentials
  frames += 1;
  const dt = 1 / FPS;
  if (dz < 2) { 
    dz += 1 * dt;
  }
  angle += (2 * Math.PI * dt) / 10;
  r.clear();
  // Animation need to be called strictly after clear()

  for (let i = 0; i < amount; i++) {
    const step = steps[i];
    const c = circles[i];
    const coll = r.checkEdge(c.center, c.radius * 400);
    if (coll.x || coll.y) step.scaleSelf(-1);

    for (const other of circles) {
      if (other.center !== c.center) {
        if (c.isTouchingCircle(other)) {
          const toOther = Vec.subtractVectors(other.center, c.center); 
          

          const overlap = (c.radius + other.radius) - Vec.distanceTo(c.center, other.center);
          if(overlap > 0) {
            c.move(Vec.scaleVector(Vec.getNormalvector(toOther), -overlap / 2))
          }
        }
      }
    }

    circles[i].move(step);
    r.drawCircle(circles[i], "rgb(160, 212, 91)");
  }

  // Recursion
  setTimeout(frame, 1000 / FPS);
}

r.clear();
setTimeout(frame, 1000 / FPS);
