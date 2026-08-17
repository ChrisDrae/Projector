import {
  rotateAroundX,
  rotateAroundY,
  rotateAroundZ,
} from "../rendering/renderer.js";
import { Vec, Vec3Like } from "./vectors.js";

interface Point {
  x: number;
  y: number;
  z: number;
}

export class Cube {
  dimension: number;
  localPoints: Vec[]; // fixed shape, always centered at (0,0,0) — never mutated by translate
  position: Vec3Like = { x: 0, y: 0, z: 0 }; // world offset — translate() touches this instead
  faces: number[][];

  constructor(d: number) {
    const h = d / 2;
    this.dimension = d;
    this.localPoints = [
      Vec.create({ x: h, y: h, z: h }),
      Vec.create({ x: -h, y: -h, z: h }),
      Vec.create({ x: h, y: -h, z: h }),
      Vec.create({ x: -h, y: h, z: h }),
      Vec.create({ x: h, y: h, z: -h }),
      Vec.create({ x: -h, y: -h, z: -h }),
      Vec.create({ x: h, y: -h, z: -h }),
      Vec.create({ x: -h, y: h, z: -h }),
    ];
    this.faces = [
      [0, 2, 1, 3],
      [4, 6, 5, 7],
      [0, 4],
      [3, 7],
      [2, 6],
      [1, 5],
    ];
  }

  translate(v: Vec3Like): void {
    this.position = {
      x: this.position.x + v.x,
      y: this.position.y + v.y,
      z: this.position.z + v.z,
    };
  }

  rotate(delta: Vec3Like): void {
    // delta.x/y/z = rotation angle in radians around each axis, applied this call
    this.localPoints = this.localPoints.map((p) => {
      const withZ = rotateAroundZ(p, delta.z);
      const withY = rotateAroundY(withZ, delta.y);
      const withX = rotateAroundX(withY, delta.x);
      return Vec.create(withX);
    });
  }

  addKeycontrol(): void {
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      const step = 0.1;

      switch (event.key) {
        case "ArrowUp":
          this.translate({ x: 0, y: 0, z: -step });
          break;
        case "ArrowDown":
          this.translate({ x: 0, y: 0, z: step });
          break;
        case "ArrowLeft":
          this.translate({ x: step, y: 0, z: 0 });
          break;
        case "ArrowRight":
          this.translate({ x: -step, y: 0, z: 0 });
          break;
      }
    });
  }

  addMouseDragRotate(): void {
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    const sensitivity = 0.01;

    window.addEventListener("mousedown", (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      this.rotate({ x: dy * sensitivity, y: dx * sensitivity, z: 0 });
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });
  }
  // world-space points, computed on read — this is what the renderer should consume
  get points(): Vec[] {
    return this.localPoints.map((p) =>
      Vec.create({
        x: p.x + this.position.x,
        y: p.y + this.position.y,
        z: p.z + this.position.z,
      }),
    );
  }
}

function addMouseDragRotate() {
  throw new Error("Function not implemented.");
}
