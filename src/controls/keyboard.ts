/** Tracks which keys are held, by KeyboardEvent.code (layout independent, e.g. "ArrowLeft", "KeyW"). */
export class KeyboardState {
  private readonly down: Set<string> = new Set();
  private readonly target: Window | HTMLElement;
  private readonly onDown = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    this.down.add(code);
    if (this.preventDefault.has(code)) e.preventDefault();
  };
  private readonly onUp = (e: Event): void => {
    this.down.delete((e as KeyboardEvent).code);
  };
  private readonly onBlur = (): void => {
    this.down.clear();
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

  /** -1, 0 or 1 depending on which of the two keys is held. */
  axis(negative: string, positive: string): number {
    return (this.down.has(positive) ? 1 : 0) - (this.down.has(negative) ? 1 : 0);
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onDown);
    this.target.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    this.down.clear();
  }
}
