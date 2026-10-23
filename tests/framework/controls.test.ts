import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstPersonControls } from "../../src/controls/firstPersonControls.js";
import { KeyboardState } from "../../src/controls/keyboard.js";
import { Simulation } from "../../src/framework/simulation.js";
import type { RenderBackend } from "../../src/rendering/backend.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { Scene } from "../../src/scene/scene.js";

/** Just enough DOM for the controls: pointer lock that a test can allow or refuse. */
class FakeDocument extends EventTarget {
  pointerLockElement: unknown = null;
  exitPointerLock(): void {
    this.pointerLockElement = null;
    this.dispatchEvent(new Event("pointerlockchange"));
  }
}

let doc: FakeDocument;
let win: EventTarget;

class FakeElement extends EventTarget {
  lockAllowed = true;
  requestPointerLock(): Promise<void> {
    if (!this.lockAllowed) return Promise.reject(new Error("refused"));
    doc.pointerLockElement = this;
    doc.dispatchEvent(new Event("pointerlockchange"));
    return Promise.resolve();
  }
}

const mouse = (type: string, props: Record<string, number> = {}): Event =>
  Object.assign(new Event(type), { button: 0, movementX: 0, movementY: 0, clientX: 0, clientY: 0, ...props });
const key = (type: string, code: string): Event => Object.assign(new Event(type), { code });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function controls(lockAllowed: boolean = true): { c: FirstPersonControls; el: FakeElement; camera: PerspectiveCamera } {
  const el = new FakeElement();
  el.lockAllowed = lockAllowed;
  const camera = new PerspectiveCamera();
  return { c: new FirstPersonControls(camera, el as unknown as HTMLElement), el, camera };
}

beforeEach(() => {
  doc = new FakeDocument();
  win = new EventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FirstPersonControls", () => {
  it("captures the pointer on click, turns with the mouse and reports buttons", () => {
    const { c, el, camera } = controls();
    const buttons: string[] = [];
    c.onButton = (b, down) => buttons.push(`${b}${down ? "+" : "-"}`);
    el.dispatchEvent(mouse("click"));
    expect(c.locked).toBe(true);
    expect(c.active).toBe(true);

    doc.dispatchEvent(mouse("mousemove", { movementX: 100, movementY: -40 }));
    expect(c.yaw).toBeCloseTo(0.25);
    expect(c.pitch).toBeCloseTo(0.1);
    doc.dispatchEvent(mouse("mousemove", { movementY: -10000 }));
    expect(c.pitch).toBeCloseTo(c.maxPitch);

    c.pitch = 0;
    c.update();
    const f = camera.getForward({ x: 0, y: 0, z: 0 });
    const g = c.forward({ x: 0, y: 0, z: 0 });
    expect(f.x).toBeCloseTo(g.x);
    expect(f.z).toBeCloseTo(g.z);
    const r = camera.getRight({ x: 0, y: 0, z: 0 });
    const h = c.right({ x: 0, y: 0, z: 0 });
    expect(r.x).toBeCloseTo(h.x);
    expect(r.z).toBeCloseTo(h.z);

    el.dispatchEvent(mouse("mousedown", { button: 2 }));
    win.dispatchEvent(mouse("mouseup", { button: 2 }));
    expect(buttons).toEqual(["2+", "2-"]);

    // Esc in the browser releases the pointer
    doc.exitPointerLock();
    expect(c.active).toBe(false);
  });

  it("ignores the click that starts it", () => {
    const { c, el } = controls();
    const buttons: number[] = [];
    c.onButton = (b) => buttons.push(b);
    el.dispatchEvent(mouse("mousedown"));
    win.dispatchEvent(mouse("mouseup"));
    el.dispatchEvent(mouse("click"));
    expect(c.active).toBe(true);
    expect(buttons).toEqual([]);
  });

  it("falls back to dragging where pointer lock is refused", async () => {
    const { c, el } = controls(false);
    const buttons: string[] = [];
    c.onButton = (b, down) => buttons.push(`${b}${down ? "+" : "-"}`);
    el.dispatchEvent(mouse("click"));
    await flush();
    expect(c.active).toBe(true);
    expect(c.locked).toBe(false);

    // Moving without a button held does nothing; dragging turns the view and is no click
    doc.dispatchEvent(mouse("mousemove", { movementX: 100, clientX: 100 }));
    expect(c.yaw).toBe(0);
    el.dispatchEvent(mouse("mousedown", { clientX: 10, clientY: 10 }));
    doc.dispatchEvent(mouse("mousemove", { movementX: 40, clientX: 50, clientY: 10 }));
    win.dispatchEvent(mouse("mouseup", { clientX: 50, clientY: 10 }));
    expect(c.yaw).toBeCloseTo(0.1);
    expect(buttons).toEqual([]);

    // A click without dragging is a press and release
    el.dispatchEvent(mouse("mousedown", { button: 2, clientX: 10, clientY: 10 }));
    win.dispatchEvent(mouse("mouseup", { button: 2, clientX: 11, clientY: 10 }));
    expect(buttons).toEqual(["2+", "2-"]);

    win.dispatchEvent(key("keydown", "Escape"));
    expect(c.active).toBe(false);
  });
});

describe("KeyboardState", () => {
  it("reports presses until the frame ends, once per press", () => {
    const target = new EventTarget();
    const kb = new KeyboardState(target as unknown as Window);
    target.dispatchEvent(key("keydown", "KeyE"));
    target.dispatchEvent(key("keyup", "KeyE"));
    // Released already, but pressed during this frame
    expect(kb.isDown("KeyE")).toBe(false);
    expect(kb.wasPressed("KeyE")).toBe(true);
    kb.endFrame();
    expect(kb.wasPressed("KeyE")).toBe(false);

    target.dispatchEvent(key("keydown", "Space"));
    kb.endFrame();
    // Auto-repeat while held is not a new press
    target.dispatchEvent(key("keydown", "Space"));
    expect(kb.wasPressed("Space")).toBe(false);
    expect(kb.isDown("Space")).toBe(true);
  });
});

describe("Simulation input options", () => {
  const backend: RenderBackend = {
    name: "none",
    stats: { primitives: 0, batches: 0, culled: 0, ms: 0 },
    setSize() {},
    render() {},
    dispose() {},
  };
  const canvas = (): HTMLCanvasElement => new FakeElement() as unknown as HTMLCanvasElement;

  it("takes the keys to prevent as a list or by name", () => {
    expect([...new Simulation({ canvas: canvas(), backend, keyboard: ["KeyQ"] }).keyboard!.preventDefault]).toEqual(["KeyQ"]);
    const named = new Simulation({ canvas: canvas(), backend, keyboard: { preventDefault: ["Space"] } });
    expect([...named.keyboard!.preventDefault]).toEqual(["Space"]);
    expect(new Simulation({ canvas: canvas(), backend, keyboard: {} }).keyboard!.preventDefault.has("ArrowUp")).toBe(true);
    expect(new Simulation({ canvas: canvas(), backend, keyboard: false }).keyboard).toBeNull();
  });

  it("ends the keyboard's frame and applies first-person look every frame", () => {
    const sim = new Simulation({ canvas: canvas(), backend, firstPerson: { yaw: 0.5 } });
    expect(sim.orbit).toBeNull();
    win.dispatchEvent(key("keydown", "KeyE"));
    expect(sim.keyboard!.wasPressed("KeyE")).toBe(true);
    sim.firstPerson!.yaw = 1;
    sim.frame(1 / 60);
    expect(sim.keyboard!.wasPressed("KeyE")).toBe(false);
    const f = sim.camera.getForward({ x: 0, y: 0, z: 0 });
    expect(f.x).toBeCloseTo(Math.sin(1));
    sim.dispose();
  });
});

describe("Scene", () => {
  it("sets the ambient intensity from its options", () => {
    expect(new Scene().ambient.intensity).toBe(0.3);
    expect(new Scene({ ambient: 0.6 }).ambient.intensity).toBe(0.6);
  });
});
