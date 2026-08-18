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
import { CollisionSystem } from "./physics/collision.js";
import { Line } from "./objects/line.js";
import { SpatialGrid } from "./utility/partitioning.js";

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

const cubi = new Cube(0.5, { x: 0, y: 0.4, z: 0.2 });

cubi.addKeycontrol();
cubi.addMouseDragRotate();


const circles: Array<Circle> = [];

const Radius = 0.003

const perlin = new PerlinNoise();

let frames = 0;
const h = cubi.dimension / 2;
const amount = 1000;

for (let i = 0; i < amount; i++) {
    const x = cubi.position.x + (Math.random() * 2 - 1) * (h - Radius);
    const y = cubi.position.y + (Math.random() * 2 - 1) * (h - Radius);
    const z = cubi.position.z + (Math.random() * 2 - 1) * (h - Radius);
    circles[i] = new Circle({ x, y, z }, Radius);
}

const steps: Array<Vec> = [];

for (let i = 0; i < amount; i++) {
  const rangeX = -0.0025 + (Math.random() * 0.005)
  const rangeY = -0.0025 + (Math.random() * 0.005)
  const rangeZ = -0.01 + (Math.random() * 0.02)

  steps[i] = new Vec({ x: rangeX, y: rangeY, z: rangeZ});
}

const delta = {x:0.005,y: -0.005,z:0.005}
const test = new Line(2, {x: 0, y: 0.4, z: 0.2}, {x: 0, y: 0, z: -1});
test.rotate({x:0,y:0,z:0})

let measuredFPS = FPS;
const aimedMillisecondsPerFrame = 1000 / FPS

const grid = new SpatialGrid(Radius * 2);

const gravitation = {x:0,y: -9.1/10000,z:0}

function frame(): void {
    const start = performance.now()
    frames += 1;
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

    const end = performance.now()
    const timeElapsed = (end - start) 
    measuredFPS = 1000 / timeElapsed
    console.log(measuredFPS)
    requestAnimationFrame(frame);
}


r.clear();
requestAnimationFrame(frame);
