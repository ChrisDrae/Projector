import * as mat4 from "./mat4.js";
import * as quat from "./quat.js";
import type { Mat4 } from "./mat4.js";
import type { Quat } from "./quat.js";
import type { Vec3 } from "./vec3.js";

const scratch: Quat = quat.create();

/** Position, rotation and scale of an object. Can be shared between a scene node and a physics collider. */
export class Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  readonly matrix: Mat4 = mat4.create();

  constructor(
    position: Vec3 = { x: 0, y: 0, z: 0 },
    rotation: Quat = quat.create(),
    scale: Vec3 = { x: 1, y: 1, z: 1 },
  ) {
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }

  translate(v: Vec3): this {
    this.position.x += v.x;
    this.position.y += v.y;
    this.position.z += v.z;
    return this;
  }

  /** Rotates around the world axes (radians, applied Z, Y, X). Stored as a quaternion, so it never drifts. */
  rotateWorld(dx: number, dy: number, dz: number): this {
    quat.fromEuler(scratch, dx, dy, dz);
    quat.multiply(this.rotation, scratch, this.rotation);
    quat.normalize(this.rotation, this.rotation);
    return this;
  }

  /** Rotates around the object's own axes. */
  rotateLocal(dx: number, dy: number, dz: number): this {
    quat.fromEuler(scratch, dx, dy, dz);
    quat.multiply(this.rotation, this.rotation, scratch);
    quat.normalize(this.rotation, this.rotation);
    return this;
  }

  updateMatrix(): Mat4 {
    return mat4.compose(this.matrix, this.rotation, this.position, this.scale);
  }

  /** The object's local x, y and z axes in world space (unit length, ignores scale). */
  axes(outX: Vec3, outY: Vec3, outZ: Vec3): void {
    quat.axes(this.rotation, outX, outY, outZ);
  }

  toWorld(out: Vec3, local: Vec3): Vec3 {
    out.x = local.x * this.scale.x;
    out.y = local.y * this.scale.y;
    out.z = local.z * this.scale.z;
    quat.rotateVec3(out, this.rotation, out);
    out.x += this.position.x;
    out.y += this.position.y;
    out.z += this.position.z;
    return out;
  }

  toLocal(out: Vec3, world: Vec3): Vec3 {
    out.x = world.x - this.position.x;
    out.y = world.y - this.position.y;
    out.z = world.z - this.position.z;
    quat.conjugate(scratch, this.rotation);
    quat.rotateVec3(out, scratch, out);
    out.x /= this.scale.x;
    out.y /= this.scale.y;
    out.z /= this.scale.z;
    return out;
  }
}
