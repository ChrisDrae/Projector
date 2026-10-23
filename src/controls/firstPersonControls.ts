import type { Vec3 } from "../math/vec3.js";
import type { PerspectiveCamera } from "../scene/camera.js";

export interface FirstPersonControlsOptions {
  /** Radians per pixel of mouse movement. Default 0.0025. */
  sensitivity?: number;
  /** How far the view tilts up or down, in radians. Default just under 90°. */
  maxPitch?: number;
  /** Starting view: yaw 0 looks along +z and grows to the right, pitch > 0 looks up. */
  yaw?: number;
  pitch?: number;
  /** Start (capture the pointer) when the element is clicked. Default true. */
  clickToStart?: boolean;
  /** Where the browser refuses pointer lock, look around by dragging instead. Default true. */
  dragFallback?: boolean;
}

/** Mouse movement in pixels before a press counts as a drag rather than a click (drag fallback). */
const DRAG_THRESHOLD = 4;

/**
 * Mouse look for first-person views. Clicking the element captures the pointer (pointer lock); mouse
 * movement then turns the view, and Esc releases it. Where the browser refuses pointer lock (some
 * embedded or automated browsers) the controls fall back to dragging: drag to turn, and a click
 * without dragging counts as a button press. Mouse buttons are reported through onButton while active.
 * update() puts yaw and pitch on the camera; Simulation calls it every frame.
 */
export class FirstPersonControls {
  readonly camera: PerspectiveCamera;
  readonly element: HTMLElement;
  yaw: number;
  pitch: number;
  sensitivity: number;
  maxPitch: number;
  dragFallback: boolean;
  /** Mouse buttons while active (0 left, 1 middle, 2 right): down, then up. */
  onButton: ((button: number, down: boolean) => void) | null = null;
  /** The controls started (pointer captured, or drag fallback) or stopped. */
  onActiveChange: ((active: boolean) => void) | null = null;
  private activeNow: boolean = false;
  private dragging: boolean = false;
  private drag: { x: number; y: number; button: number; moved: boolean } | null = null;
  private readonly clickToStart: boolean;

  private readonly onClick = (): void => {
    if (this.clickToStart && !this.activeNow) this.start();
  };
  private readonly onLockChange = (): void => {
    if (this.locked) {
      this.dragging = false;
      this.setActive(true);
    } else if (!this.dragging) {
      this.setActive(false);
    }
  };
  private readonly onLockError = (): void => this.fallBack();
  private readonly onMouseMove = (e: MouseEvent): void => {
    if (this.locked) {
      this.look(e.movementX, e.movementY);
    } else if (this.drag) {
      this.look(e.movementX, e.movementY);
      if (Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y) > DRAG_THRESHOLD) this.drag.moved = true;
    }
  };
  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.activeNow) return;
    if (this.locked) this.onButton?.(e.button, true);
    else if (this.dragging) this.drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
  };
  private readonly onMouseUp = (e: MouseEvent): void => {
    const drag = this.drag;
    this.drag = null;
    if (drag) {
      // A click without dragging is a press and release
      if (!drag.moved) {
        this.onButton?.(drag.button, true);
        this.onButton?.(drag.button, false);
      }
    } else if (this.locked) {
      this.onButton?.(e.button, false);
    }
  };
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Escape" && this.dragging) this.stop();
  };
  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  constructor(camera: PerspectiveCamera, element: HTMLElement, options: FirstPersonControlsOptions = {}) {
    this.camera = camera;
    this.element = element;
    this.yaw = options.yaw ?? 0;
    this.pitch = options.pitch ?? 0;
    this.sensitivity = options.sensitivity ?? 0.0025;
    this.maxPitch = options.maxPitch ?? Math.PI / 2 - 0.01;
    this.clickToStart = options.clickToStart ?? true;
    this.dragFallback = options.dragFallback ?? true;
    element.addEventListener("click", this.onClick);
    element.addEventListener("mousedown", this.onMouseDown);
    element.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("pointerlockerror", this.onLockError);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    this.update();
  }

  /** Whether the controls are turning the view (pointer captured, or in drag fallback). */
  get active(): boolean {
    return this.activeNow;
  }

  /** Whether the pointer is captured. */
  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Captures the pointer; call it from a user gesture such as a click. Falls back to dragging if refused. */
  start(): void {
    let request: Promise<void> | void;
    try {
      request = this.element.requestPointerLock();
    } catch {
      this.fallBack();
      return;
    }
    if (request) request.catch(() => this.fallBack());
  }

  /** Releases the pointer and stops turning the view. */
  stop(): void {
    this.dragging = false;
    this.drag = null;
    if (this.locked) document.exitPointerLock();
    this.setActive(false);
  }

  /** Turns the view by a mouse movement in pixels. */
  look(dx: number, dy: number): void {
    this.yaw += dx * this.sensitivity;
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch - dy * this.sensitivity));
  }

  /** Direction the view faces on the ground plane (unit, y = 0): where "forward" walks. */
  forward(out: Vec3): Vec3 {
    out.x = Math.sin(this.yaw);
    out.y = 0;
    out.z = Math.cos(this.yaw);
    return out;
  }

  /** To the right of forward() on the ground plane. */
  right(out: Vec3): Vec3 {
    out.x = Math.cos(this.yaw);
    out.y = 0;
    out.z = -Math.sin(this.yaw);
    return out;
  }

  /** Puts yaw and pitch on the camera (its position is left to the caller). */
  update(): void {
    this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));
    this.camera.setYawPitch(this.yaw, this.pitch);
  }

  dispose(): void {
    this.stop();
    this.element.removeEventListener("click", this.onClick);
    this.element.removeEventListener("mousedown", this.onMouseDown);
    this.element.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("pointerlockerror", this.onLockError);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  private fallBack(): void {
    if (!this.dragFallback || this.locked) return;
    this.dragging = true;
    this.setActive(true);
  }

  private setActive(active: boolean): void {
    if (active === this.activeNow) return;
    this.activeNow = active;
    this.drag = null;
    this.onActiveChange?.(active);
  }
}
