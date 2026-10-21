/** Small DOM overlay with live stats and controls for the demos. */
export class Hud {
  readonly root: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly controlsEl: HTMLElement;
  private readonly cells: Map<string, HTMLElement> = new Map();
  private readonly pending: Map<string, string> = new Map();
  private lastFlush: number = 0;

  constructor(root: HTMLElement, title: string, help: string = "") {
    this.root = root;
    root.replaceChildren();

    const h1 = document.createElement("h1");
    const back = document.createElement("a");
    back.href = "../../";
    back.textContent = "←";
    back.title = "All demos";
    h1.append(back, title);
    root.append(h1);

    if (help) {
      const p = document.createElement("p");
      p.className = "help";
      p.textContent = help;
      root.append(p);
    }

    this.statsEl = document.createElement("div");
    this.statsEl.className = "stats";
    this.controlsEl = document.createElement("div");
    this.controlsEl.className = "controls";
    root.append(this.statsEl, this.controlsEl);
  }

  /** Sets a stat row; the DOM is only updated a few times per second. */
  stat(label: string, value: string | number): void {
    const text = typeof value === "number" ? formatNumber(value) : value;
    this.pending.set(label, text);
    if (!this.cells.has(label)) {
      const name = document.createElement("span");
      name.textContent = label;
      const cell = document.createElement("span");
      this.statsEl.append(name, cell);
      this.cells.set(label, cell);
    }
  }

  /** Writes pending stats to the DOM at most every `interval` ms. */
  flush(now: number = performance.now(), interval: number = 250): void {
    if (now - this.lastFlush < interval) return;
    this.lastFlush = now;
    for (const [label, text] of this.pending) {
      const cell = this.cells.get(label);
      if (cell && cell.textContent !== text) cell.textContent = text;
    }
    this.pending.clear();
  }

  row(): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";
    this.controlsEl.append(row);
    return row;
  }

  button(label: string, onClick: () => void, row: HTMLElement = this.row()): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    row.append(b);
    return b;
  }

  select<T extends string>(label: string, options: readonly T[], value: T, onChange: (v: T) => void): HTMLSelectElement {
    const l = document.createElement("label");
    l.textContent = label;
    const s = document.createElement("select");
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      s.append(opt);
    }
    s.value = value;
    s.addEventListener("change", () => onChange(s.value as T));
    l.append(s);
    this.controlsEl.append(l);
    return s;
  }

  slider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (v: number) => void,
  ): HTMLInputElement {
    const l = document.createElement("label");
    const name = document.createElement("span");
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const show = (): void => {
      name.textContent = `${label} ${formatNumber(Number(input.value))}`;
    };
    input.addEventListener("input", () => {
      show();
      onChange(Number(input.value));
    });
    show();
    l.append(name, input);
    this.controlsEl.append(l);
    return input;
  }
}

function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}
