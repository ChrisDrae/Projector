import { describe, expect, it } from "vitest";
import { Mesh } from "../../src/scene/mesh.js";
import { parseColor, toCss } from "../../src/rendering/color.js";

function centroidDotNormal(mesh: Mesh): number[] {
  const out: number[] = [];
  for (let f = 0; f < mesh.faceCount; f++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const start = mesh.faceStart[f];
    const end = mesh.faceStart[f + 1];
    for (let k = start; k < end; k++) {
      const i = mesh.faceIndices[k] * 3;
      cx += mesh.positions[i];
      cy += mesh.positions[i + 1];
      cz += mesh.positions[i + 2];
    }
    const n = mesh.faceNormals;
    out.push(n[f * 3] * cx + n[f * 3 + 1] * cy + n[f * 3 + 2] * cz);
  }
  return out;
}

describe("Mesh", () => {
  it("builds a box with outward faces and 12 unique edges", () => {
    const box = Mesh.box(2, 1, 3);
    expect(box.vertexCount).toBe(8);
    expect(box.faceCount).toBe(6);
    expect(box.edges.length / 2).toBe(12);
    for (const d of centroidDotNormal(box)) expect(d).toBeGreaterThan(0);
  });

  it("builds a sphere with outward faces", () => {
    const sphere = Mesh.sphere(1, 10, 6);
    for (const d of centroidDotNormal(sphere)) expect(d).toBeGreaterThan(0);
  });

  it("builds an upward plane in grid order", () => {
    const plane = Mesh.plane(2, 2, 4, 3);
    expect(plane.vertexCount).toBe(5 * 4);
    expect(plane.faceCount).toBe(12);
    for (let f = 0; f < plane.faceCount; f++) expect(plane.faceNormals[f * 3 + 1]).toBeCloseTo(1, 6);
  });

  it("builds line-only grids", () => {
    const grid = Mesh.grid(2, 4);
    expect(grid.faceCount).toBe(0);
    expect(grid.edges.length / 2).toBe(10);
  });

  it("builds closed cylinders, capsules and icospheres with outward faces", () => {
    const cylinder = Mesh.cylinder(0.5, 2, 12);
    expect(cylinder.faceCount).toBe(12 + 2);
    const capsule = Mesh.capsule(0.3, 0.5, 12, 4);
    const ico = Mesh.icosphere(1, 2);
    expect(ico.faceCount).toBe(20 * 16);
    for (const mesh of [cylinder, capsule, ico]) {
      for (const d of centroidDotNormal(mesh)) expect(d).toBeGreaterThan(0);
      // Closed surface: every edge is shared by exactly two faces
      const uses = new Map<string, number>();
      for (let f = 0; f < mesh.faceCount; f++) {
        for (let k = mesh.faceStart[f]; k < mesh.faceStart[f + 1]; k++) {
          const a = mesh.faceIndices[k];
          const b = mesh.faceIndices[k + 1 < mesh.faceStart[f + 1] ? k + 1 : mesh.faceStart[f]];
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          uses.set(key, (uses.get(key) ?? 0) + 1);
        }
      }
      for (const n of uses.values()) expect(n).toBe(2);
    }
    // The capsule spans the full physics shape: half height plus radius on each side
    let maxY = -Infinity;
    for (let i = 1; i < capsule.positions.length; i += 3) maxY = Math.max(maxY, capsule.positions[i]);
    expect(maxY).toBeCloseTo(0.8);
  });

  it("computes smooth corner normals that keep hard edges", () => {
    const ico = Mesh.icosphere(2, 2);
    const n = ico.computeCornerNormals();
    for (let k = 0; k < ico.faceIndices.length; k++) {
      const v = ico.faceIndices[k] * 3;
      // On a sphere the smooth normal is close to the direction of the vertex
      const dot = (n[k * 3] * ico.positions[v] + n[k * 3 + 1] * ico.positions[v + 1] + n[k * 3 + 2] * ico.positions[v + 2]) / 2;
      expect(dot).toBeGreaterThan(0.99);
    }

    const cylinder = Mesh.cylinder(1, 1, 16);
    const c = cylinder.computeCornerNormals(Math.PI / 4);
    const caps = [cylinder.faceCount - 2, cylinder.faceCount - 1];
    for (let f = 0; f < cylinder.faceCount; f++) {
      for (let k = cylinder.faceStart[f]; k < cylinder.faceStart[f + 1]; k++) {
        if (caps.includes(f)) {
          // The rim is a hard edge: cap corners keep the flat cap normal
          expect(Math.abs(c[k * 3 + 1])).toBeCloseTo(1, 5);
        } else {
          // Side corners are horizontal: averaged around the side, not with the caps
          expect(c[k * 3 + 1]).toBeCloseTo(0, 5);
        }
      }
    }
  });

  it("recomputes corner normals only after markDirty", () => {
    const plane = Mesh.plane(1, 1, 2, 2);
    const first = plane.computeCornerNormals();
    expect(plane.computeCornerNormals()).toBe(first);
    plane.setVertex(4, 0, 0.5, 0);
    plane.markDirty();
    const k = Array.from(plane.faceIndices).indexOf(4);
    const n = plane.computeCornerNormals();
    expect(n[k * 3 + 1]).toBeLessThan(0.999);
  });
});

describe("color", () => {
  it("parses hex, rgb and hsl", () => {
    expect(parseColor("#d618c6")).toEqual({ r: 214, g: 24, b: 198 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("rgb(160, 212, 91)")).toEqual({ r: 160, g: 212, b: 91 });
    expect(toCss(parseColor("hsl(120, 100%, 50%)"))).toBe("rgb(0, 255, 0)");
    expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255 });
  });
});
