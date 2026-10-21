import { describe, expect, it } from "vitest";
import * as mat4 from "../../src/math/mat4.js";
import * as quat from "../../src/math/quat.js";
import * as vec3 from "../../src/math/vec3.js";
import { Transform } from "../../src/math/transform.js";

function expectIdentity(m: Float64Array): void {
  for (let i = 0; i < 16; i++) expect(m[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 10);
}

describe("mat4", () => {
  it("invert(m) * m is the identity", () => {
    const q = quat.setAxisAngle(quat.create(), { x: 1, y: -2, z: 0.5 }, 1.3);
    const m = mat4.compose(mat4.create(), q, { x: 3, y: -1, z: 2 }, { x: 2, y: 0.5, z: 1.5 });
    const inv = mat4.invert(mat4.create(), m);
    expect(inv).not.toBeNull();
    expectIdentity(mat4.multiply(mat4.create(), inv!, m));
    expectIdentity(mat4.multiply(mat4.create(), m, inv!));
  });

  it("returns null for singular matrices", () => {
    const m = mat4.create();
    m[0] = 0;
    expect(mat4.invert(mat4.create(), m)).toBeNull();
  });

  it("compose agrees with Transform.toWorld", () => {
    const t = new Transform({ x: 1, y: 2, z: 3 }, quat.fromEuler(quat.create(), 0.4, 1.2, -0.3), {
      x: 2,
      y: 1,
      z: 0.5,
    });
    const p = { x: -0.5, y: 0.25, z: 4 };
    const a = mat4.transformPoint(vec3.create(), t.updateMatrix(), p);
    const b = t.toWorld(vec3.create(), p);
    expect(vec3.equals(a, b, 1e-12)).toBe(true);
  });

  it("lookAtLH moves the eye to the origin and the target onto +z", () => {
    const eye = { x: 2, y: 3, z: -4 };
    const target = { x: -1, y: 0.5, z: 1 };
    const view = mat4.lookAtLH(mat4.create(), eye, target, { x: 0, y: 1, z: 0 });
    const e = mat4.transformPoint(vec3.create(), view, eye);
    expect(vec3.equals(e, { x: 0, y: 0, z: 0 }, 1e-12)).toBe(true);
    const t = mat4.transformPoint(vec3.create(), view, target);
    expect(t.x).toBeCloseTo(0, 12);
    expect(t.y).toBeCloseTo(0, 12);
    expect(t.z).toBeCloseTo(vec3.distance(eye, target), 12);
    // Orthonormal rows
    const r = { x: view[0], y: view[4], z: view[8] };
    const u = { x: view[1], y: view[5], z: view[9] };
    expect(vec3.length(r)).toBeCloseTo(1, 12);
    expect(vec3.length(u)).toBeCloseTo(1, 12);
    expect(vec3.dot(r, u)).toBeCloseTo(0, 12);
    // Up stays up
    expect(u.y).toBeGreaterThan(0);
  });

  it("lookAtLH handles looking straight down", () => {
    const view = mat4.lookAtLH(mat4.create(), { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    for (let i = 0; i < 16; i++) expect(Number.isFinite(view[i])).toBe(true);
    const t = mat4.transformPoint(vec3.create(), view, { x: 0, y: 0, z: 0 });
    expect(t.z).toBeCloseTo(5, 12);
  });

  it("perspectiveLH maps near to -1 and far to 1", () => {
    const p = mat4.perspectiveLH(mat4.create(), Math.PI / 2, 1, 0.1, 100);
    const ndcZ = (z: number) => (p[10] * z + p[14]) / z;
    expect(ndcZ(0.1)).toBeCloseTo(-1, 10);
    expect(ndcZ(100)).toBeCloseTo(1, 10);
  });
});
