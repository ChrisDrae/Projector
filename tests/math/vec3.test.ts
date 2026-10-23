import { describe, expect, it } from "vitest";
import * as vec3 from "../../src/math/vec3.js";
import * as quat from "../../src/math/quat.js";

describe("vec3", () => {
  it("does arithmetic into out vectors", () => {
    const out = vec3.create();
    expect(vec3.add(out, { x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 2, y: 3, z: 4 });
    expect(vec3.sub(out, out, { x: 2, y: 3, z: 4 })).toEqual({ x: 0, y: 0, z: 0 });
    expect(vec3.scaleAndAdd(out, { x: 1, y: 1, z: 1 }, { x: 1, y: 2, z: 3 }, 2)).toEqual({ x: 3, y: 5, z: 7 });
  });

  it("cross follows x * y = z and allows aliasing", () => {
    const a = { x: 1, y: 0, z: 0 };
    vec3.cross(a, a, { x: 0, y: 1, z: 0 });
    expect(a).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("normalizes safely", () => {
    const out = vec3.create();
    expect(vec3.normalize(out, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    vec3.normalize(out, { x: 3, y: 0, z: 4 });
    expect(vec3.length(out)).toBeCloseTo(1, 12);
  });

  it("transformQuat matches quat.rotateVec3", () => {
    const q = quat.setAxisAngle(quat.create(), { x: 1, y: 2, z: 3 }, 0.7);
    const v = { x: 0.3, y: -1.2, z: 2 };
    const a = vec3.transformQuat(vec3.create(), v, q);
    const b = quat.rotateVec3(vec3.create(), q, v);
    expect(vec3.equals(a, b, 1e-12)).toBe(true);
    expect(vec3.length(a)).toBeCloseTo(vec3.length(v), 12);
  });
});
