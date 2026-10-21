import * as mat4 from "../math/mat4.js";
import * as quat from "../math/quat.js";
import type { Mat4 } from "../math/mat4.js";
import type { Quat } from "../math/quat.js";
import type { Vec3 } from "../math/vec3.js";

export interface PerspectiveCameraOptions {
  position?: Vec3;
  /** Vertical field of view in radians. */
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
}

const X_AXIS: Vec3 = { x: 1, y: 0, z: 0 };
const Y_AXIS: Vec3 = { x: 0, y: 1, z: 0 };
const Z_AXIS: Vec3 = { x: 0, y: 0, z: 1 };
const UNIT_SCALE: Vec3 = { x: 1, y: 1, z: 1 };
const qa: Quat = quat.create();
const qb: Quat = quat.create();
const right: Vec3 = { x: 0, y: 0, z: 0 };
const up: Vec3 = { x: 0, y: 0, z: 0 };
const forward: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Perspective camera looking along its local +z axis (left-handed: x right, y up, z into the screen).
 * The default 90° field of view gives a focal length of 1, which is exactly the x' = x / z projection
 * the project started with. The default position matches the original fixed camera at z = -1.5.
 */
export class PerspectiveCamera {
  position: Vec3;
  /** Camera-to-world rotation. */
  rotation: Quat;
  fov: number;
  aspect: number;
  near: number;
  far: number;
  readonly worldMatrix: Mat4 = mat4.create();
  readonly viewMatrix: Mat4 = mat4.create();
  readonly projectionMatrix: Mat4 = mat4.create();

  constructor(options: PerspectiveCameraOptions = {}) {
    this.position = options.position ?? { x: 0, y: 0, z: -1.5 };
    this.rotation = quat.create();
    this.fov = options.fov ?? Math.PI / 2;
    this.aspect = options.aspect ?? 1;
    this.near = options.near ?? 0.01;
    this.far = options.far ?? 1000;
    this.updateMatrices();
  }

  /** Distance to the projection plane at which the view spans [-1, 1] vertically. */
  get focalLength(): number {
    return 1 / Math.tan(this.fov / 2);
  }

  lookAt(target: Vec3, upVector: Vec3 = Y_AXIS): this {
    mat4.lookAtLH(this.viewMatrix, this.position, target, upVector);
    const v = this.viewMatrix;
    // The rows of the view rotation are the camera axes in world space
    right.x = v[0];
    right.y = v[4];
    right.z = v[8];
    up.x = v[1];
    up.y = v[5];
    up.z = v[9];
    forward.x = v[2];
    forward.y = v[6];
    forward.z = v[10];
    quat.fromBasis(this.rotation, right, up, forward);
    return this;
  }

  /** Yaw > 0 turns right, pitch > 0 looks up. Yaw 0 / pitch 0 looks along +z. */
  setYawPitch(yaw: number, pitch: number): this {
    quat.setAxisAngle(qa, Y_AXIS, yaw);
    quat.setAxisAngle(qb, X_AXIS, -pitch);
    quat.multiply(this.rotation, qa, qb);
    return this;
  }

  getForward(out: Vec3): Vec3 {
    return quat.rotateVec3(out, this.rotation, Z_AXIS);
  }

  getRight(out: Vec3): Vec3 {
    return quat.rotateVec3(out, this.rotation, X_AXIS);
  }

  getUp(out: Vec3): Vec3 {
    return quat.rotateVec3(out, this.rotation, Y_AXIS);
  }

  /** Called by the backend before every render. */
  updateMatrices(): void {
    mat4.compose(this.worldMatrix, this.rotation, this.position, UNIT_SCALE);
    mat4.invert(this.viewMatrix, this.worldMatrix);
    mat4.perspectiveLH(this.projectionMatrix, this.fov, this.aspect, this.near, this.far);
  }
}
