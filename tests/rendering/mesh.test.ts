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
