import { Cube } from "./objects/cube.js";
import { RendererEngine, rotateAroundY, rotateAroundZ, translateZ } from "./rendering/renderer.js";

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

const rect: Vec3[] = [
    { x: 0.25, y: 0.25, z: 0.25 },
    { x: -0.25, y: -0.25, z: 0.25 },
    { x: 0.25, y: -0.25, z: 0.25 },
    { x: -0.25, y: 0.25, z: 0.25 },
    { x: 0.25, y: 0.25, z: -0.25 },
    { x: -0.25, y: -0.25, z: -0.25 },
    { x: 0.25, y: -0.25, z: -0.25 },
    { x: -0.25, y: 0.25, z: -0.25 },
];



const faces: number[][] = [
    [0, 2, 1, 3],
    [4, 6, 5, 7],
    [0, 4],
    [3, 7],
    [2, 6],
    [1, 5],
];

let angle = 0;
let dz = 0;

function drawRetreatingCube(cube: Cube, offset = 0): void {
    for (const face of cube.faces) {
        for (let i = 0; i < face.length; i++) {
            const a = cube.points[face[i]];
            const b = cube.points[face[(i + 1) % face.length]];

            const aMoving = translateZ(rotateAroundZ(rotateAroundY(a, angle), angle), dz - offset);
            const bMoving = translateZ(rotateAroundZ(rotateAroundY(b, angle), angle), dz - offset);
            r.drawPoint(aMoving)
            r.drawLine(aMoving, bMoving)
        }
    }
}

function drawCube(cube: Cube): void {
    for(const face of cube.faces){
        for (let i = 0; i < face.length; i++) {
            const a = cube.points[face[i]];
            const b = cube.points[face[(i + 1) % face.length]];
            r.drawPoint(a)
            r.drawLine(a, b);
        }
    }
}

const Cubos = new Cube(1)
const Cubi = new Cube(0.5)


window.addEventListener('keydown', (event: KeyboardEvent) => {
    const step = 0.1;

    switch(event.key){
        case 'ArrowUp':
            Cubos.translate({x: 0, y: -step, z: 0});
            break;
        case 'ArrowDown':
            Cubos.translate({x: 0, y: step, z: 0});
            break;
        case 'ArrowLeft':
            Cubos.translate({x: step, y: 0, z: 0});
            break;
        case 'ArrowRight':
            Cubos.translate({x: -step, y: 0, z: 0});
            break;
    }
})


function frame(): void {
    const dt = 1 / FPS;
    if (dz < 2) {
        dz += 1 * dt;
    }
    angle += (2 * Math.PI * dt) / 10;
    r.clear();
    drawRetreatingCube(Cubos, -1)
    drawRetreatingCube(Cubi, -1)
    setTimeout(frame, 1000 / FPS);
}

r.clear();
setTimeout(frame, 1000 / FPS);
