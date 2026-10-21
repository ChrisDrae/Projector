import { nextPow2 } from "../math/scalar.js";
import type { BodyStore } from "./bodyStore.js";
import { BodyFlags } from "./types.js";

export interface BroadphaseOptions {
  /** Grid cell size. Default: just over the largest collision diameter. */
  cellSize?: number;
}

export interface BroadphaseStats {
  cellSize: number;
  /** Most bodies sharing one hash bucket. */
  maxBucket: number;
  /** Narrow-phase distance checks performed. */
  candidateTests: number;
  pairs: number;
}

function hash(ix: number, iy: number, iz: number, mask: number): number {
  return (Math.imul(ix, 92837111) ^ Math.imul(iy, 689287499) ^ Math.imul(iz, 283923481)) & mask;
}

/**
 * Uniform grid broadphase over the SoA body store. Cells are hashed into a power-of-two table and filled
 * with a counting sort, so a rebuild is O(n) with no strings, Maps or per-frame allocations. Every body
 * looks at the 27 cells around it and each candidate pair is reported exactly once.
 */
export class HashGrid {
  cellSize: number = 0;
  tableSize: number = 0;
  /** Bucket b holds entries[cellStart[b] .. cellStart[b + 1]). */
  cellStart: Int32Array = new Int32Array(1);
  entries: Int32Array = new Int32Array(0);
  /** Bucket of each body, -1 if it does not collide. */
  bodyHash: Int32Array = new Int32Array(0);
  /** Body index pairs (i < j) found by the last findPairs(). */
  pairs: Int32Array = new Int32Array(0);
  pairCount: number = 0;
  readonly stats: BroadphaseStats = { cellSize: 0, maxBucket: 0, candidateTests: 0, pairs: 0 };
  protected readonly fixedCellSize: number | null;
  private stamp: Int32Array = new Int32Array(0);
  private stampValue: number = 0;

  constructor(options: BroadphaseOptions = {}) {
    this.fixedCellSize = options.cellSize ?? null;
  }

  /** Extra distance at which pairs are reported, so contacts that form during solver iterations are caught. */
  margin(s: BodyStore): number {
    return 0.1 * s.maxRadius;
  }

  build(s: BodyStore): void {
    const n = s.count;
    const maxR = s.maxRadius;
    // Cells must span a full contact distance or the 27-cell neighborhood could miss pairs
    const minCell = 2 * maxR + this.margin(s);
    this.cellSize = Math.max(this.fixedCellSize ?? minCell * 1.05, minCell, 1e-9);
    this.stats.cellSize = this.cellSize;

    const tableSize = nextPow2(Math.max(1024, 2 * n));
    if (tableSize > this.tableSize) {
      this.tableSize = tableSize;
      this.cellStart = new Int32Array(tableSize + 1);
      this.stamp = new Int32Array(tableSize);
      this.stampValue = 0;
    }
    if (this.entries.length < n) {
      this.entries = new Int32Array(s.capacity);
      this.bodyHash = new Int32Array(s.capacity);
    }

    const mask = this.tableSize - 1;
    const inv = 1 / this.cellSize;
    const pos = s.pos;
    const flags = s.flags;
    const cellStart = this.cellStart;
    const bodyHash = this.bodyHash;
    cellStart.fill(0);

    for (let i = 0; i < n; i++) {
      if (!(flags[i] & BodyFlags.Collides)) {
        bodyHash[i] = -1;
        continue;
      }
      const o = i * 3;
      const h = hash(Math.floor(pos[o] * inv), Math.floor(pos[o + 1] * inv), Math.floor(pos[o + 2] * inv), mask);
      bodyHash[i] = h;
      cellStart[h]++;
    }

    // Counting sort: inclusive prefix sums, then fill backwards so each bucket ends up in index order
    let running = 0;
    let maxBucket = 0;
    for (let b = 0; b < this.tableSize; b++) {
      const c = cellStart[b];
      if (c > maxBucket) maxBucket = c;
      running += c;
      cellStart[b] = running;
    }
    cellStart[this.tableSize] = running;
    const entries = this.entries;
    for (let i = n - 1; i >= 0; i--) {
      const h = bodyHash[i];
      if (h >= 0) entries[--cellStart[h]] = i;
    }
    this.stats.maxBucket = maxBucket;
  }

  findPairs(s: BodyStore): void {
    this.pairCount = 0;
    this.stats.candidateTests = 0;
    const n = s.count;
    if (s.maxRadius <= 0) {
      this.stats.pairs = 0;
      return;
    }
    const pos = s.pos;
    const radius = s.radius;
    const margin = this.margin(s);
    const inv = 1 / this.cellSize;
    const mask = this.tableSize - 1;
    const { cellStart, entries, bodyHash, stamp } = this;
    let tests = 0;

    for (let i = 0; i < n; i++) {
      if (bodyHash[i] < 0) continue;
      const o = i * 3;
      const xi = pos[o];
      const yi = pos[o + 1];
      const zi = pos[o + 2];
      const ri = radius[i] + margin;
      const cx = Math.floor(xi * inv);
      const cy = Math.floor(yi * inv);
      const cz = Math.floor(zi * inv);
      const mark = this.nextStamp();

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const b = hash(cx + dx, cy + dy, cz + dz, mask);
            // Several neighbor cells can hash to the same bucket: visit each bucket once
            if (stamp[b] === mark) continue;
            stamp[b] = mark;
            const end = cellStart[b + 1];
            for (let k = cellStart[b]; k < end; k++) {
              const j = entries[k];
              if (j <= i) continue;
              tests++;
              const oj = j * 3;
              const ddx = pos[oj] - xi;
              const ddy = pos[oj + 1] - yi;
              const ddz = pos[oj + 2] - zi;
              const rr = ri + radius[j];
              if (ddx * ddx + ddy * ddy + ddz * ddz < rr * rr) this.pushPair(i, j);
            }
          }
        }
      }
    }
    this.stats.candidateTests = tests;
    this.stats.pairs = this.pairCount;
  }

  protected pushPair(i: number, j: number): void {
    if (this.pairCount * 2 + 2 > this.pairs.length) {
      const next = new Int32Array(Math.max(1024, this.pairs.length * 2));
      next.set(this.pairs);
      this.pairs = next;
    }
    this.pairs[this.pairCount * 2] = i;
    this.pairs[this.pairCount * 2 + 1] = j;
    this.pairCount++;
  }

  private nextStamp(): number {
    if (this.stampValue >= 0x7ffffffe) {
      this.stamp.fill(0);
      this.stampValue = 0;
    }
    return ++this.stampValue;
  }
}
