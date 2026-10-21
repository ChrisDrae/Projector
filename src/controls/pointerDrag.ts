export interface PointerDragOptions {
  /** Mouse button that starts a drag: 0 left, 1 middle, 2 right. Touch and pen count as 0. Default 0. */
  button?: number;
}

/** Reports pointer drag deltas (CSS pixels) on an element. Uses pointer capture, so drags can leave the element. */
export class PointerDrag {
  dragging: boolean = false;
  private pointerId: number = -1;
  private lastX: number = 0;
  private lastY: number = 0;
  private readonly element: HTMLElement;
  private readonly button: number;
  private readonly onDrag: (dx: number, dy: number, e: PointerEvent) => void;

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.dragging || e.button !== this.button) return;
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (dx !== 0 || dy !== 0) this.onDrag(dx, dy, e);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = -1;
    if (this.element.hasPointerCapture(e.pointerId)) this.element.releasePointerCapture(e.pointerId);
  };

  constructor(
    element: HTMLElement,
    onDrag: (dx: number, dy: number, e: PointerEvent) => void,
    options: PointerDragOptions = {},
  ) {
    this.element = element;
    this.onDrag = onDrag;
    this.button = options.button ?? 0;
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerUp);
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
  }
}
