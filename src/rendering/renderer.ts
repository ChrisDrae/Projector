import Circle from "../objects/circle";
import { Cube } from "../objects/cube";

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  background: string;
  dimensions: [number, number];
}

const ELEMENT = "#d618c6";

export class RendererEngine implements Renderer {
  ctx: CanvasRenderingContext2D;
  background: string;
  dimensions: [number, number];

  constructor(props: Renderer) {
    ((this.ctx = props.ctx),
      (this.background = props.background),
      (this.dimensions = props.dimensions));
  }

  clear(): void {
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.dimensions[0], this.dimensions[1]);
  }

  drawPoint({ x, y, z }: Vec3, color: string = ELEMENT): void {
    /**This Draws the Points Projected from 3D coordinates onto the Canvas with the {x: 0,y: 0} in the center  */
    this.ctx.fillStyle = color;
    const pV = toScreenCoordinates(
      project(toCamera({ x, y, z })),
      this.dimensions,
    );
    const c = 2;
    this.ctx.fillRect(pV.x - c / 2, pV.y - c / 2, c, c);
  }

  drawLine(p: Vec3, d: Vec3, color: string = ELEMENT): void {
    //Project and Translate
    const pV = toScreenCoordinates(project(toCamera(p)), this.dimensions);
    const dV = toScreenCoordinates(project(toCamera(d)), this.dimensions);
    //Draw 2D Context Line
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(pV.x, pV.y);
    this.ctx.lineTo(dV.x, dV.y);
    this.ctx.closePath();
    this.ctx.stroke();
  }

  fillPolygon(pArray: Vec3[], color: string = ELEMENT): void {
    this.ctx.fillStyle = color;

    const first = toScreenCoordinates(
      project(toCamera(pArray[0])),
      this.dimensions,
    );

    this.ctx.beginPath();
    this.ctx.moveTo(first.x, first.y);
    for (const p of pArray) {
      if (toScreenCoordinates(project(toCamera(p)), this.dimensions) === first)
        continue;
      const tmp = toScreenCoordinates(project(toCamera(p)), this.dimensions);
      this.ctx.lineTo(tmp.x, tmp.y);
    }

    this.ctx.closePath();
    this.ctx.fill();
  }

  drawYPlane(color: string = ELEMENT) {
    const p = { x: 0, y: 0, z: 0 };
    const d = { x: -2, y: -2, z: 0 };
    const edge = { x: 1.5, y: -1.5, z: 0 };

    const h1 = { x: 2, y: 0, z: -1 };
    const h2 = { x: -2, y: 0, z: -1 };

    const edge2 = { x: 1.5, y: -0.5, z: 0 };
    const edge3 = { x: 1.5, y: -0.25, z: 0 };

    const edge4 = { x: -1.5, y: -0.5, z: 0 };
    const edge5 = { x: -1.5, y: -0.25, z: 0 };

    this.drawLine(p, edge2, color);
    this.drawLine(edge3, p, color);
    this.drawLine(edge4, p, color);
    this.drawLine(edge5, p, color);

    //horiztontal
    this.drawLine(h1, h2, color);

    this.drawLine(p, d, color);
    this.drawLine(p, edge, color);
  }

  drawCube(cube: Cube, color: string = ELEMENT): void {
    for (const face of cube.faces) {
      for (let i = 0; i < face.length; i++) {
        const a = cube.points[face[i]];
        const b = cube.points[face[(i + 1) % face.length]];
        this.drawPoint(a, color);
        this.drawLine(a, b, color);
      }
    }
  }

  drawRetreatingCube(cube: Cube, offset = 0, dz: number, angle: number): void {
    for (const face of cube.faces) {
      for (let i = 0; i < face.length; i++) {
        const a = cube.points[face[i]];
        const b = cube.points[face[(i + 1) % face.length]];

        const aMoving = translateZ(
          rotateAroundZ(rotateAroundY(a, angle), angle),
          dz + offset,
        );
        const bMoving = translateZ(
          rotateAroundZ(rotateAroundY(b, angle), angle),
          dz + offset,
        );
        this.drawPoint(aMoving);
        this.drawLine(aMoving, bMoving);
      }
    }
  }

  drawCircle(circle: Circle, color: string = ELEMENT) {
    this.ctx.beginPath();
    const p = toScreenCoordinates(
      project(toCamera(circle.center)),
      this.dimensions,
    );
    this.ctx.arc(p.x, p.y, circle.radius, 0, 2 * Math.PI, false);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.lineWidth = 0.1;
    this.ctx.strokeStyle = "#000000";
    this.ctx.stroke();
  }

  checkEdge(p: Vec3, radius = 0) {
    const s = toScreenCoordinates(project(toCamera(p)), this.dimensions);
    const [w, h] = this.dimensions;
    return {
      x: s.x - radius < 0 || s.x + radius > w,
      y: s.y - radius < 0 || s.y + radius > h,
    };
  }
}

// Transform Vector Functions

export function rotateAroundZ({ x, y, z }: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x * c - y * s,
    y: x * s + y * c,
    z,
  };
}

export function translateZ({ x, y, z }: Vec3, dz: number): Vec3 {
  return {
    x,
    y,
    z: z + dz,
  };
}

export function rotateAroundY({ x, y, z }: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x * c - z * s,
    y,
    z: x * s + z * c,
  };
}

export function rotateAroundX({ x, y, z }: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x,
    y: y * c - z * s,
    z: y * s + z * c,
  };
}

//Coordinate Space Logic Functions

const CAMERA_Z = -1.5;

export function toCamera(p: Vec3): Vec3 {
  return { x: p.x, y: p.y, z: p.z - CAMERA_Z };
}

export function project({ x, y, z }: Vec3): Vec2 {
  return {
    x: x / z,
    y: y / z,
  };
}

export function toScreenCoordinates(p: Vec2, d: [number, number]): Vec2 {
  return {
    x: ((p.x + 1) / 2) * d[0],
    y: (1 - (p.y + 1) / 2) * d[1],
  };
}
