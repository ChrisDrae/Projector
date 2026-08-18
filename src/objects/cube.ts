import {
  rotateAroundX,
  rotateAroundY,
  rotateAroundZ,
  Vec3,
} from "../rendering/renderer.js";
import Circle from "./circle.js";
import { Vec } from "./vectors.js";

interface Point {
  x: number;
  y: number;
  z: number;
}

export class Cube {
  dimension: number;
  localPoints: Vec[]; // fixed shape, always centered at (0,0,0) — never mutated by translate
  position: Vec3 = { x: 0, y: 0, z: 0 }; // world offset — translate() touches this instead
  faces: number[][];

  constructor(d: number, p: Vec3) {
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
    this.position = p
  }

  translate(v: Vec3): void {
    this.position = {
      x: this.position.x + v.x,
      y: this.position.y + v.y,
      z: this.position.z + v.z,
    };
  }

  rotate(delta: Vec3): void {
    // delta.x/y/z = rotation angle in radians around each axis, applied this call
    this.localPoints = this.localPoints.map((p) => {
      const withZ = rotateAroundZ(p, delta.z);
      const withY = rotateAroundY(withZ, delta.y);
      const withX = rotateAroundX(withY, delta.x);
      return Vec.create(withX);
    });
  }

  checkCircleCubeCollision(circle: Circle): {x: boolean, y: boolean, z: boolean}{
    const r = circle.baseRadius;
    const h = this.dimension / 2
    const axis = this.axis;

    // Transform circle center into cube local space and subtract the cube world position first
    const local = {
      x: circle.center.x - this.position.x,
      y: circle.center.y - this.position.y,
      z: circle.center.z - this.position.z
    }
    
    // Project onto each local axis using the first 3 world-space points
    

    const projX = Vec.dot(local, axis.x);
    const projY = Vec.dot(local, axis.y);
    const projZ = Vec.dot(local, axis.z);


    // Push circle back inside bounds along each axis
    if (projX - r < -h) {
        const correction = (-h + r) - projX;
        circle.center.x += correction * axis.x.x;
        circle.center.y += correction * axis.x.y;
        circle.center.z += correction * axis.x.z;
    } else if (projX + r > h) {
        const correction = (h - r) - projX;
        circle.center.x += correction * axis.x.x;
        circle.center.y += correction * axis.x.y;
        circle.center.z += correction * axis.x.z;
    }

    if (projY - r < -h) {
        const correction = (-h + r) - projY;
        circle.center.x += correction * axis.y.x;
        circle.center.y += correction * axis.y.y;
        circle.center.z += correction * axis.y.z;
    } else if (projY + r > h) {
        const correction = (h - r) - projY;
        circle.center.x += correction * axis.y.x;
        circle.center.y += correction * axis.y.y;
        circle.center.z += correction * axis.y.z;
    }

    if (projZ - r < -h) {
        const correction = (-h + r) - projZ;
        circle.center.x += correction * axis.z.x;
        circle.center.y += correction * axis.z.y;
        circle.center.z += correction * axis.z.z;
    } else if (projZ + r > h) {
        const correction = (h - r) - projZ;
        circle.center.x += correction * axis.z.x;
        circle.center.y += correction * axis.z.y;
        circle.center.z += correction * axis.z.z;
    }

    return {
      x: projX -r < -h || projX + r > h,
      y: projY -r < -h || projY + r > h,
      z: projZ -r < -h || projZ + r > h
    }
  }

  get axis(): { x: Vec3, y: Vec3, z: Vec3 } {
    return {
        x: Vec.getNormalvector(Vec.subtractVectors(this.localPoints[0], this.localPoints[3])),
        y: Vec.getNormalvector(Vec.subtractVectors(this.localPoints[0], this.localPoints[2])),
        z: Vec.getNormalvector(Vec.subtractVectors(this.localPoints[0], this.localPoints[4])),
    };
}

  addKeycontrol(): void {
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      const step = 0.1;

      switch (event.key) {
        case "ArrowUp":
          this.translate({ x: 0, y: -step, z: 0 });
          break;
        case "ArrowDown":
          this.translate({ x: 0, y: step, z: 0 });
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
