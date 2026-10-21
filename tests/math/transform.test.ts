import { describe, expect, it } from "vitest";
import { Transform } from "../../src/math/transform.js";
import * as vec3 from "../../src/math/vec3.js";

describe("Transform", () => {
  it("toLocal inverts toWorld", () => {
    const t = new Transform({ x: 0.5, y: -2, z: 1 }, undefined, { x: 2, y: 3, z: 0.5 });
    t.rotateWorld(0.3, -1.1, 0.8);
    const p = { x: 1.25, y: -0.5, z: 2 };
    const back = t.toLocal(vec3.create(), t.toWorld(vec3.create(), p));
    expect(vec3.equals(back, p, 1e-12)).toBe(true);
  });

  it("does not drift after many incremental rotations", () => {
    const t = new Transform();
    for (let i = 0; i < 10000; i++) t.rotateWorld(0.013, -0.007, 0.021);
    const ax = vec3.create();
    const ay = vec3.create();
    const az = vec3.create();
    t.axes(ax, ay, az);
    expect(vec3.length(ax)).toBeCloseTo(1, 10);
    expect(vec3.length(ay)).toBeCloseTo(1, 10);
    expect(vec3.dot(ax, ay)).toBeCloseTo(0, 10);
    expect(vec3.dot(ay, az)).toBeCloseTo(0, 10);
  });

  it("translate moves the shared position object", () => {
    const position = { x: 0, y: 0.4, z: 0.2 };
    const t = new Transform(position);
    t.translate({ x: 1, y: 0, z: 0 });
    expect(position.x).toBe(1);
  });
});
