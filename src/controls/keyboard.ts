/** Tracks which keys are held, by KeyboardEvent.code (layout independent, e.g. "ArrowLeft", "KeyW"). */
export class KeyboardState {
  private readonly down: Set<string> = new Set();
  /** Keys that went down since the last endFrame(). */
  private readonly pressed: Set<string> = new Set();
  private readonly target: Window | HTMLElement;
  private readonly onDown = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    // Auto-repeat sends more keydowns while held; only the first one is a press
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
    if (this.preventDefault.has(code)) e.preventDefault();
  };
  private readonly onUp = (e: Event): void => {
    this.down.delete((e as KeyboardEvent).code);
  };
  private readonly onBlur = (): void => {
    this.down.clear();
    this.pressed.clear();
  };
  /** Codes whose default browser action (e.g. scrolling) is suppressed. */
  readonly preventDefault: Set<string>;

  constructor(target: Window | HTMLElement = window, preventDefault: string[] = []) {
    this.target = target;
    this.preventDefault = new Set(preventDefault);
    target.addEventListener("keydown", this.onDown);
    target.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /**
   * Whether the key went down since the previous frame, even if it is already up again (Simulation
   * calls endFrame() after every frame). Read it in update(), not fixedUpdate(): that runs zero or
   * several times a frame.
   */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Forgets the presses of the frame that just ended. */
  endFrame(): void {
    this.pressed.clear();
  }

  /** -1, 0 or 1 depending on which of the two keys is held. */
  axis(negative: string, positive: string): number {
    return (this.down.has(positive) ? 1 : 0) - (this.down.has(negative) ? 1 : 0);
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onDown);
    this.target.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    this.down.clear();
    this.pressed.clear();
  }
}
