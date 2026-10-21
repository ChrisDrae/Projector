import { describe, expect, it } from "vitest";
import * as quat from "../../src/math/quat.js";
import * as vec3 from "../../src/math/vec3.js";
import { rotateAroundX, rotateAroundY, rotateAroundZ } from "../../src/legacy.js";
import { Random } from "../../src/utility/random.js";

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

describe("quat", () => {
  const rnd = new Random(7);
  const samples = Array.from({ length: 20 }, () => ({
    v: { x: rnd.range(-2, 2), y: rnd.range(-2, 2), z: rnd.range(-2, 2) },
    a: rnd.range(-Math.PI, Math.PI),
  }));

  it("axis-angle around X and Z matches the legacy rotation functions", () => {
    for (const { v, a } of samples) {
      const out = vec3.create();
      quat.rotateVec3(out, quat.setAxisAngle(quat.create(), X, a), v);
      expect(vec3.equals(out, rotateAroundX(v, a), 1e-12)).toBe(true);
      quat.rotateVec3(out, quat.setAxisAngle(quat.create(), Z, a), v);
      expect(vec3.equals(out, rotateAroundZ(v, a), 1e-12)).toBe(true);
    }
  });

  it("legacy rotateAroundY(a) is a right-handed rotation by -a", () => {
    for (const { v, a } of samples) {
      const out = quat.rotateVec3(vec3.create(), quat.setAxisAngle(quat.create(), Y, -a), v);
      expect(vec3.equals(out, rotateAroundY(v, a), 1e-12)).toBe(true);
    }
  });

  it("multiply applies the right operand first", () => {
    const qa = quat.setAxisAngle(quat.create(), Z, Math.PI / 2);
    const qb = quat.setAxisAngle(quat.create(), X, Math.PI / 2);
    const q = quat.multiply(quat.create(), qa, qb);
    // X rotation leaves X alone, then Z turns X into Y
    expect(vec3.equals(quat.rotateVec3(vec3.create(), q, X), Y, 1e-12)).toBe(true);
  });

  it("fromEuler applies Z, then Y, then X", () => {
    const q = quat.fromEuler(quat.create(), 0.3, -0.8, 1.1);
    const qx = quat.setAxisAngle(quat.create(), X, 0.3);
    const qy = quat.setAxisAngle(quat.create(), Y, -0.8);
    const qz = quat.setAxisAngle(quat.create(), Z, 1.1);
    const expected = quat.multiply(quat.create(), qx, quat.multiply(quat.create(), qy, qz));
    for (let i = 0; i < 4; i++) expect(q[i]).toBeCloseTo(expected[i], 12);
  });

  it("fromBasis round-trips through axes", () => {
    const q = quat.setAxisAngle(quat.create(), { x: -1, y: 0.4, z: 2 }, 2.4);
    const ax = vec3.create();
    const ay = vec3.create();
    const az = vec3.create();
    quat.axes(q, ax, ay, az);
    const r = quat.fromBasis(quat.create(), ax, ay, az);
    const v = { x: 0.2, y: 1.5, z: -0.7 };
    const a = quat.rotateVec3(vec3.create(), q, v);
    const b = quat.rotateVec3(vec3.create(), r, v);
    expect(vec3.equals(a, b, 1e-12)).toBe(true);
  });

  it("integrate stays unit length over many small steps", () => {
    const q = quat.create();
    const omega = { x: 3.1, y: -2.2, z: 0.7 };
    for (let i = 0; i < 10000; i++) quat.integrate(q, q, omega, 1 / 120);
    const len = Math.hypot(q[0], q[1], q[2], q[3]);
    expect(len).toBeCloseTo(1, 12);
  });

  it("integrate turns by |omega| * dt around omega", () => {
    const q = quat.integrate(quat.create(), quat.create(), { x: 0, y: 0, z: Math.PI }, 0.5);
    expect(vec3.equals(quat.rotateVec3(vec3.create(), q, X), Y, 1e-12)).toBe(true);
  });
});
