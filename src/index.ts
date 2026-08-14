type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };

const canvasElement = document.getElementById("canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element with id 'canvas' was not found.");
}


const canvas = canvasElement;
canvas.width = 800;
canvas.height = 800;
const ratio = canvas.width/canvas.height

const ELEMENT = "#18d641";
const BACKGROUND = "#333131";
const FPS = 60;

const ctx = canvas.getContext("2d");

if (!ctx) {
    throw new Error("Unable to get a 2D rendering context for the canvas.");
}

const context: CanvasRenderingContext2D = ctx;

function clear(): void {
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function project({ x, y, z }: Vec3): Vec2 {
    return {
        x: x / z,
        y: y / z,
    };
}

function toScreenCoordinates(p: Vec2): Vec2 {
    return {
        x: (p.x + 1) / 2 * canvas.width / ratio,
        y: (1 - (p.y + 1) / 2) * canvas.height,
    };
}

function drawPoint({ x, y }: Vec2): void {
    context.fillStyle = ELEMENT;
    const c = 10;
    context.fillRect(x - c / 2, y - c / 2, c, c);
}

function drawLine(p: Vec2, d: Vec2): void {
    context.lineWidth = 10;
    context.strokeStyle = ELEMENT;
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(d.x, d.y);
    context.closePath();
    context.stroke();
}

function rotateXY({ x, y, z }: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - z * s,
        y,
        z: x * s + z * c,
    };
}

function rotateYZ({ x, y, z }: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - y * s,
        y: x * s + y * c,
        z,
    };
}

function translateZ({ x, y, z }: Vec3, dz: number): Vec3 {
    return {
        x,
        y,
        z: z + dz,
    };
}

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

interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

class Vec implements Vec3Like{
    x: number;
    y: number;
    z: number;

    static create(v: Vec3Like){
        return new Vec(v)
    }

    constructor(v: Vec3Like){
        this.x = v.x,
        this.y = v.y,
        this.z = v.z
    }

    add(v: Vec3Like){
        return new Vec({
            x: this.x + v.x,
            y: this.y + v.y,
            z: this.z + v.z
        })
    }
}

class Cube {
    dimension: number;
    points: Vec[];
    faces: number[][];

    constructor(d: number){
        const h = d/2
        this.dimension = d;
        this.points = [
            Vec.create({ x: h, y: h, z: h }),
            Vec.create({ x: -h, y: -h, z: h }),
            Vec.create({ x: h, y: -h, z: h }),
            Vec.create({ x: -h, y: h, z: h }),
            Vec.create({ x: h, y: h, z: -h }),
            Vec.create({ x: -h, y: -h, z: -h }),
            Vec.create({ x: h, y: -h, z: -h }),
            Vec.create({ x: -h, y: h, z: -h }),
        ],
        this.faces = [  
            [0, 2, 1, 3],
            [4, 6, 5, 7],
            [0, 4],
            [3, 7],
            [2, 6],
            [1, 5],
        ]
    }

    translate(v: Vec3Like){
        const newPoints = [];
        for(const p of this.points){
            newPoints.push(p.add(v))
        }
        this.points = newPoints
    }
}

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

            const aProjected = toScreenCoordinates(project(translateZ(rotateYZ(rotateXY(a, angle), angle), dz - offset)));
            const bProjected = toScreenCoordinates(project(translateZ(rotateYZ(rotateXY(b, angle), angle), dz - offset)));

            drawPoint(aProjected);
            drawLine(aProjected, bProjected);
        }
    }
}

function drawCube(cube: Cube): void {
    for(const face of cube.faces){
        for (let i = 0; i < face.length; i++) {
            const a = cube.points[face[i]];
            const b = cube.points[face[(i + 1) % face.length]];

            const aProjected = toScreenCoordinates(project(a));
            const bProjected = toScreenCoordinates(project(b));

            drawPoint(aProjected);
            drawLine(aProjected, bProjected);
        }
    }
}

const Cubos = new Cube(1)
const Cubi = new Cube(0.5)
Cubos.translate({x: 0, y: 0, z: -1.5 })
Cubi.translate({x: 0, y: 0, z: -1.5 })


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
    clear();
    drawCube(Cubos)
    setTimeout(frame, 1000 / FPS);
}

clear();
setTimeout(frame, 1000 / FPS);
