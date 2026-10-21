import type { Vec3 } from "../math/vec3.js";
import type { PerspectiveCamera } from "../scene/camera.js";
import { PointerDrag } from "./pointerDrag.js";

export interface OrbitControlsOptions {
  /** Mouse button that orbits: 0 left, 2 right. Default 0. */
  button?: number;
  target?: Vec3;
  distance?: number;
  yaw?: number;
  pitch?: number;
}

const forward: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Orbits the camera around a target: drag to rotate, mouse wheel to zoom. With yaw = pitch = 0 the camera
 * sits on the -z side of the target looking along +z, like the original fixed camera.
 */
export class OrbitControls {
  readonly camera: PerspectiveCamera;
  target: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  /** Radians per dragged pixel. */
  rotateSpeed: number = 0.006;
  /** Zoom factor per wheel delta unit. */
  zoomSpeed: number = 0.0012;
  minDistance: number = 0.05;
  maxDistance: number = 500;
  enabled: boolean = true;
  private readonly element: HTMLElement;
  private readonly drag: PointerDrag;
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.distance *= Math.exp(e.deltaY * this.zoomSpeed);
    this.update();
  };

  constructor(camera: PerspectiveCamera, element: HTMLElement, options: OrbitControlsOptions = {}) {
    this.camera = camera;
    this.element = element;
    this.target = options.target ?? { x: 0, y: 0, z: 0 };
    this.distance = options.distance ?? 1.5;
    this.yaw = options.yaw ?? 0;
    this.pitch = options.pitch ?? 0;
    this.drag = new PointerDrag(
      element,
      (dx, dy) => {
        if (!this.enabled) return;
        this.yaw += dx * this.rotateSpeed;
        this.pitch -= dy * this.rotateSpeed;
        this.update();
      },
      { button: options.button ?? 0 },
    );
    element.addEventListener("wheel", this.onWheel, { passive: false });
    this.update();
  }

  /** Places the camera from target, yaw, pitch and distance. */
  update(): void {
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    const cam = this.camera;
    cam.setYawPitch(this.yaw, this.pitch);
    cam.getForward(forward);
    cam.position.x = this.target.x - forward.x * this.distance;
    cam.position.y = this.target.y - forward.y * this.distance;
    cam.position.z = this.target.z - forward.z * this.distance;
  }

  dispose(): void {
    this.drag.dispose();
    this.element.removeEventListener("wheel", this.onWheel);
  }
}
