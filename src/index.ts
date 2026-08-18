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

const FPS = 60/4;

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

const circle = new Circle({ x: 0.1, y: -0.1, z: 0 }, 25);

const circles: Record<string, Circle> = { circle };
const circlesArray: Array<Circle> = []

for (let i = 0; i < 100; i++) {
  const tmp = i * 0.01;
  circles[`circle${i}`] = new Circle(
    { x: tmp * Math.random(), y: Math.random() * 0.5, z: 0 },
    0.07,
  );
  circlesArray.push(circles[`circle${i}`] )
}
const perlin = new PerlinNoise();
const interval = perlin.noise2D(0.3, 0) * 0.1;
const intervalY = perlin.noise2D(0.3, 1000) * 0.1;
let step = new Vec({ x: interval, y: intervalY, z: 0 });

let frames = 0;

const steps: Record<string, Vec> = { step };
const amount = 10;

for (let i = 0; i < amount; i++) {
  const tmp = perlin.noise2D(0.5, 10000 * i) * 0.1;
  steps[`step${i}`] = new Vec({ x: tmp, y: Math.random() * 0.02, z: 0 });
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
    const step = steps[`step${i}`];
    const c = circles[`circle${i}`];
    const coll = r.checkEdge(c.center, c.radius);
    if(coll.x || coll.y) step.scaleSelf(-1)
    
    for(let j = 1 + 1; j < amount; j++){
      const other = circles[`circle${j}`]
      const d = Vec.distanceTo(c.center, other.center);
      const radii = c.radius + other.radius;
      console.log(i, j, "d=", d, "radii=", radii, "c=", c.center, "o=", other.center);
      if(c.isTouchingCircle(other)){
         step.scaleSelf(-1)
         console.log("touched")
      }
    }

    circles[`circle${i}`].move(step);
    r.drawCircle(circles[`circle${i}`], "rgb(160, 212, 91)");
  }
  
  // Recursion
  setTimeout(frame, 1000 / FPS);
}

r.clear();
setTimeout(frame, 1000 / FPS);
