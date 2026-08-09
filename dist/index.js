"use strict";
const canvasElement = document.getElementById("canvas");
if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element with id 'canvas' was not found.");
}
const canvas = canvasElement;
canvas.width = 800;
canvas.height = 800;
const ELEMENT = "#18d641";
const BACKGROUND = "#333131";
const FPS = 60;
const ctx = canvas.getContext("2d");
if (!ctx) {
    throw new Error("Unable to get a 2D rendering context for the canvas.");
}
const context = ctx;
function clear() {
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
}
function project({ x, y, z }) {
    return {
        x: x / z,
        y: y / z,
    };
}
function toScreenCoordinates(p) {
    return {
        x: (p.x + 1) / 2 * canvas.width,
        y: (1 - (p.y + 1) / 2) * canvas.height,
    };
}
function drawPoint({ x, y }) {
    context.fillStyle = ELEMENT;
    const c = 10;
    context.fillRect(x - c / 2, y - c / 2, c, c);
}
function drawLine(p, d) {
    context.lineWidth = 10;
    context.strokeStyle = ELEMENT;
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(d.x, d.y);
    context.closePath();
    context.stroke();
}
function rotateXY({ x, y, z }, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - z * s,
        y,
        z: x * s + z * c,
    };
}
function rotateYZ({ x, y, z }, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - y * s,
        y: x * s + y * c,
        z,
    };
}
function translateZ({ x, y, z }, dz) {
    return {
        x,
        y,
        z: z + dz,
    };
}
const rect = [
    { x: 0.25, y: 0.25, z: 0.25 },
    { x: -0.25, y: -0.25, z: 0.25 },
    { x: 0.25, y: -0.25, z: 0.25 },
    { x: -0.25, y: 0.25, z: 0.25 },
    { x: 0.25, y: 0.25, z: -0.25 },
    { x: -0.25, y: -0.25, z: -0.25 },
    { x: 0.25, y: -0.25, z: -0.25 },
    { x: -0.25, y: 0.25, z: -0.25 },
];
class Vec {
    static create(v) {
        return new Vec(v);
    }
    constructor(v) {
        this.x = v.x,
            this.y = v.y,
            this.z = v.z;
    }
    add(v) {
        return new Vec({
            x: this.x + v.x,
            y: this.y + v.y,
            z: this.z + v.z
        });
    }
}
class Cube {
    constructor(d) {
        const h = d / 2;
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
            ];
    }
    translate(v) {
        const newPoints = [];
        for (const p of this.points) {
            newPoints.push(p.add(v));
        }
        this.points = newPoints;
    }
}
const faces = [
    [0, 2, 1, 3],
    [4, 6, 5, 7],
    [0, 4],
    [3, 7],
    [2, 6],
    [1, 5],
];
let angle = 0;
let dz = 0;
function drawRetreatingCube(cube, offset = 0) {
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
function drawCube(cube) {
    for (const face of cube.faces) {
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
const Cubos = new Cube(1);
const Cubi = new Cube(0.5);
Cubos.translate({ x: 0, y: 0, z: -1.5 });
Cubi.translate({ x: 0, y: 0, z: -1.5 });
window.addEventListener('keydown', (event) => {
    const step = 0.1;
    switch (event.key) {
        case 'ArrowUp':
            Cubos.translate({ x: 0, y: -step, z: 0 });
            break;
        case 'ArrowDown':
            Cubos.translate({ x: 0, y: step, z: 0 });
            break;
        case 'ArrowLeft':
            Cubos.translate({ x: step, y: 0, z: 0 });
            break;
        case 'ArrowRight':
            Cubos.translate({ x: -step, y: 0, z: 0 });
            break;
    }
});
function frame() {
    const dt = 1 / FPS;
    if (dz < 2) {
        dz += 1 * dt;
    }
    angle += (2 * Math.PI * dt) / 10;
    clear();
    drawCube(Cubos);
    drawCube(Cubi);
    setTimeout(frame, 1000 / FPS);
}
clear();
setTimeout(frame, 1000 / FPS);
