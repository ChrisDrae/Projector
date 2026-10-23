import { describe, expect, it } from "vitest";
import { HashGrid, type BroadphaseOptions } from "../../src/physics/broadphase.js";
import { BodyStore } from "../../src/physics/bodyStore.js";
import { BoxContainer } from "../../src/physics/colliders.js";
import { World } from "../../src/physics/world.js";
import { BodyFlags } from "../../src/physics/types.js";
import { Random } from "../../src/utility/random.js";

function bruteForce(s: BodyStore, scale: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.count; i++) {
    if (!(s.flags[i] & BodyFlags.Collides)) continue;
    for (let j = i + 1; j < s.count; j++) {
      if (!(s.flags[j] & BodyFlags.Collides)) continue;
      const d = Math.hypot(
        s.pos[j * 3] - s.pos[i * 3],
        s.pos[j * 3 + 1] - s.pos[i * 3 + 1],
        s.pos[j * 3 + 2] - s.pos[i * 3 + 2],
      );
      if (d < (s.radius[i] + s.radius[j]) * scale) out.add(`${i},${j}`);
    }
  }
  return out;
}

function pairSet(grid: HashGrid): Set<string> {
  const out = new Set<string>();
  for (let p = 0; p < grid.pairCount; p++) {
    const i = grid.pairs[p * 2];
    const j = grid.pairs[p * 2 + 1];
    expect(i).toBeLessThan(j);
    const key = `${i},${j}`;
    if (out.has(key)) throw new Error(`duplicate pair ${key}`);
    out.add(key);
  }
  return out;
}

function randomStore(n: number, spread: number, rMin: number, rMax: number, seed: number): BodyStore {
  const s = new BodyStore("f64");
  const rnd = new Random(seed);
  for (let i = 0; i < n; i++) {
    const flags = rnd.next() < 0.9 ? BodyFlags.Collides : 0;
    s.add(rnd.range(-spread, spread), rnd.range(-spread, spread), rnd.range(-spread, spread), 0, 0, 0, rnd.range(rMin, rMax), 1, flags);
  }
  return s;
}

/** Many tiny bodies crowded into the cell of one big body: the case that broke the plain grid. */
function crowdedStore(n: number): BodyStore {
  const s = new BodyStore("f64");
  const rnd = new Random(n);
  s.add(5, 5, 5, 0, 0, 0, 0.5, 1, BodyFlags.Collides);
  for (let i = 0; i < n; i++) {
    s.add(rnd.range(0, 0.9), rnd.range(0, 0.9), rnd.range(0, 0.9), 0, 0, 0, 0.005, 1, BodyFlags.Collides);
  }
  return s;
}

function run(s: BodyStore, options: BroadphaseOptions = {}): HashGrid {
  const grid = new HashGrid(options);
  grid.build(s);
  grid.findPairs(s);
  return grid;
}

describe("HashGrid (accurate)", () => {
  it("finds exactly the brute-force pairs, each once", () => {
    const cases: Array<[number, number, number, number]> = [
      [500, 1, 0.02, 0.02],
      [800, 1.5, 0.005, 0.08],
      [300, 0.2, 0.01, 0.03],
    ];
    for (const [n, spread, rMin, rMax] of cases) {
      const s = randomStore(n, spread, rMin, rMax, n);
      const grid = run(s);
      expect(pairSet(grid)).toEqual(bruteForce(s, grid.contactScale));
    }
  });

  it("stays exact in crowded, sorted buckets", () => {
    const s = crowdedStore(3000);
    const grid = run(s, { overloadThreshold: 8 });
    expect(grid.stats.overloadedBuckets).toBeGreaterThan(0);
    expect(pairSet(grid)).toEqual(bruteForce(s, grid.contactScale));
  });

  it("stays exact for coincident bodies", () => {
    const s = new BodyStore("f64");
    for (let i = 0; i < 120; i++) s.add(1, 2, 3, 0, 0, 0, 0.01, 1, BodyFlags.Collides);
    const grid = run(s);
    expect(grid.pairCount).toBe((120 * 119) / 2);
    expect(pairSet(grid)).toEqual(bruteForce(s, grid.contactScale));
  });

  it("sorting crowded buckets cuts the narrow-phase work by more than 5x", () => {
    const s = crowdedStore(3000);
    const scanned = run(s, { overloadThreshold: Infinity });
    const swept = run(s);
    expect(scanned.pairCount).toBe(swept.pairCount);
    expect(scanned.stats.candidateTests / swept.stats.candidateTests).toBeGreaterThan(5);
  });

  it("handles negative coordinates and far-away bodies", () => {
    const s = new BodyStore("f64");
    s.add(-1000.01, -5, 3, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    s.add(-1000.15, -5, 3, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    s.add(1e6, 1e6, 1e6, 0, 0, 0, 0.1, 1, BodyFlags.Collides);
    expect(pairSet(run(s))).toEqual(new Set(["0,1"]));
  });

  it("caps the pair list and reports saturation", () => {
    const s = new BodyStore("f64");
    for (let i = 0; i < 200; i++) s.add(0, 0, 0, 0, 0, 0, 0.01, 1, BodyFlags.Collides);
    const grid = run(s, { maxPairsPerBody: 2 });
    expect(grid.pairCount).toBe(1024);
    expect(grid.stats.saturated).toBe(true);
    expect(grid.stats.droppedPairs).toBe((200 * 199) / 2 - 1024);
  });
});

describe("HashGrid (sandbox)", () => {
  it("bounds the work for 5000 coincident bodies", () => {
    const s = new BodyStore("f64");
    for (let i = 0; i < 5000; i++) s.add(0.5, 0.5, 0.5, 0, 0, 0, 0.003, 1, BodyFlags.Collides);
    const grid = run(s, { mode: "sandbox", maxPerCell: 16 });
    expect(grid.stats.candidateTests).toBeLessThanOrEqual(5000 * 27 * 16);
    expect(grid.stats.droppedBodies).toBe(5000 - 16);
    expect(grid.pairCount).toBe((16 * 15) / 2);
  });

  it("rotates which bodies are left out, so none is starved", () => {
    const s = new BodyStore("f64");
    for (let i = 0; i < 64; i++) s.add(0, 0, 0, 0, 0, 0, 0.01, 1, BodyFlags.Collides);
    const grid = new HashGrid({ mode: "sandbox", maxPerCell: 8 });
    const seen = new Set<number>();
    for (let frame = 0; frame < 40; frame++) {
      grid.build(s);
      grid.findPairs(s);
      for (let p = 0; p < grid.pairCount * 2; p++) seen.add(grid.pairs[p]);
    }
    expect(seen.size).toBe(64);
  });

  it("matches accurate mode when nothing is crowded", () => {
    const s = randomStore(600, 1, 0.01, 0.02, 3);
    expect(pairSet(run(s, { mode: "sandbox" }))).toEqual(pairSet(run(s)));
  });
});

describe("pile-ups", () => {
  it("2000 bodies dropped on one point disperse without NaN", () => {
    const world = new World({ precision: "f64", gravity: { x: 0, y: 0, z: 0 }, restitution: 0.2 });
    world.addCollider(new BoxContainer({ size: 1 }));
    for (let i = 0; i < 2000; i++) world.addBody({ position: { x: 0.1, y: 0.1, z: 0.1 }, radius: 0.01 });
    expect(world.broadphase.stats.maxBucket).toBe(0);
    let maxBucket = 0;
    for (let step = 0; step < 240; step++) {
      world.stepFixed(1 / 120);
      maxBucket = world.broadphase.stats.maxBucket;
      if (step === 0) expect(maxBucket).toBe(2000);
    }
    expect(maxBucket).toBeLessThanOrEqual(world.broadphase.overloadThreshold);
    for (let i = 0; i < world.bodies.count * 3; i++) expect(Number.isFinite(world.bodies.pos[i])).toBe(true);
  });
});
