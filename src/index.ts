import { Cube } from "./objects/cube.js";
import { Particle } from "./objects/particle.js";
import { RendererEngine, rotateAroundY, rotateAroundZ, translateZ } from "./rendering/renderer.js";
import {Vec} from "./objects/vectors"

type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };

const canvasElement = document.getElementById("canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element with id 'canvas' was not found.");
}

const BACKGROUND = "#333131";

const canvas = canvasElement;
canvas.width = 800;
canvas.height = 800;
const ratio = canvas.width/canvas.height

const FPS = 60;

const ctx = canvas.getContext("2d");

if (!ctx) {
    throw new Error("Unable to get a 2D rendering context for the canvas.");
}

const context: CanvasRenderingContext2D = ctx;

const r = new RendererEngine({ctx: context, background: BACKGROUND, dimensions: [canvas.width, canvas.height]})

let angle = 0;
let dz = 0;


const Cubi = new Cube(0.5)




const test = new Particle({x: 0, y:0 , z: 0}, 1)
Cubi.translate({x:0,y:0.5,z:0})
Cubi.addKeycontrol()
Cubi.addMouseDragRotate()

function frame(): void {
    // Calculate differentials
    const dt = 1 / FPS;
    if (dz < 2) {
        dz += 1 * dt;
    }
    angle += (2 * Math.PI * dt) / 10;
    r.clear();
    // Animation need to be called strictly after clear()
    
    r.drawCube(Cubi, "#5952bb")
    r.drawYPlane("#c2e0ae")

    // Recursion call
    setTimeout(frame, 1000 / FPS);
}

r.clear();
setTimeout(frame, 1000 / FPS);
