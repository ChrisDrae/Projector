import { describe, expect, it } from "vitest";
import { project, toCamera, toScreenCoordinates } from "../../src/legacy.js";

// Snapshot of the original x/z, y/z pipeline (camera at z = -1.5, 800x800 canvas).
// The new camera/projection pipeline must keep reproducing these numbers.
describe("legacy projection", () => {
  const screen = (x: number, y: number, z: number) =>
    toScreenCoordinates(project(toCamera({ x, y, z })), [800, 800]);

  it("maps the origin to the canvas center", () => {
    expect(screen(0, 0, 0)).toEqual({ x: 400, y: 400 });
  });

  it("divides by depth and flips y", () => {
    const p = screen(0.5, 0.25, 0.5);
    expect(p.x).toBeCloseTo(400 + 400 * (0.5 / 2), 10);
    expect(p.y).toBeCloseTo(400 - 400 * (0.25 / 2), 10);
  });
});
