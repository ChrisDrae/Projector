import {
  rotateAroundX,
  rotateAroundY,
  rotateAroundZ,
  Vec3,
} from "../rendering/renderer";
import { Vec } from "./vectors";

interface LineProps {
  length: number;
  position: Vec3;
  direction: Vec3;
}

export class Line implements LineProps {
  length: number;
  position: Vec3;
  direction: Vec3;

  constructor(l: number, position: Vec3, direction: Vec3) {
    this.length = l;
    this.position = position;
    this.direction = direction;
  }

  translate(v: Vec3) {
    this.position = Vec.addVectors(this.position, v);
  }

  rotate(delta: Vec3) {
    let d = this.direction;
    d = rotateAroundX(d, delta.x);
    d = rotateAroundY(d, delta.y);
    d = rotateAroundZ(d, delta.z);
    this.direction = Vec.getNormalvector(d);
  }

  get end(): Vec3 {
    return {
      x: this.position.x + this.direction.x * this.length,
      y: this.position.y + this.direction.y * this.length,
      z: this.position.z + this.direction.z * this.length,
    };
  }
}
