import { describe, expect, it } from "vitest";
import { HashGrid } from "../../src/physics/broadphase.js";
import { BodyStore } from "../../src/physics/bodyStore.js";
import { BodyFlags } from "../../src/physics/types.js";
import { Random } from "../../src/utility/random.js";

function bruteForce(s: BodyStore, margin: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.count; i++) {
    if (!(s.flags[i] & BodyFlags.Collides)) continue;
    for (let j = i + 1; j < s.count; j++) {
      if (!(s.flags[j] & BodyFlags.Collides)) continue;
      const d = Math.hypot(s.pos[j * 3] - s.pos[i * 3], s.pos[j * 3 + 1] - s.pos[i * 3 + 1], s.pos[j * 3 + 2] - s.pos[i * 3 + 2]);
      if (d < s.radius[i] + s.radius[j] + margin) out.add(`${i},${j}`);
    }
  }
  return out;
}

export function pairSet(grid: HashGrid): Set<string> {
  const out = new Set<string>();
  for (let p = 0; p < grid.pairCount; p++) {
    const key = `${grid.pairs[p * 2]},${grid.pairs[p * 2 + 1]}`;
    if (out.has(key)) throw new Error(`duplicate pair ${key}`);
    out.add(key);
  }
  return out;
}

export function randomStore(n: number, spread: number, rMin: number, rMax: number, seed: number): BodyStore {
  const s = new BodyStore("f64");
  const rnd = new Random(seed);
  for (let i = 0; i < n; i++) {
    const flags = rnd.next() < 0.9 ? BodyFlags.Collides : 0;
    s.add(rnd.range(-spread, spread), rnd.range(-spread, spread), rnd.range(-spread, spread), 0, 0, 0, rnd.range(rMin, rMax), 1, flags);
  }
  return s;
}

describe("HashGrid", () => {
  it("finds exactly the brute-force pairs, each once", () => {
    for (const [n, spread, rMin, rMax] of [
      [500, 1, 0.02, 0.02],
      [800, 1.5, 0.005, 0.08],
      [300, 0.2, 0.01, 0.03],
    ]) {
      const s = randomStore(n, spread, rMin, rMax, n);
      const grid = new HashGrid();
      grid.build(s);
      grid.findPairs(s);
      expect(pairSet(grid)).toEqual(bruteForce(s, grid.margin(s)));
    }
  });

  it("handles negative coordinates and far-away bodies", () => {
    const s = new BodyStore("f64");
    s.add(-1000.01, -5, 3, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    s.add(-1000.15, -5, 3, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    s.add(1e6, 1e6, 1e6, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    const grid = new HashGrid();
    grid.build(s);
    grid.findPairs(s);
    expect(pairSet(grid)).toEqual(new Set(["0,1"]));
  });
});
