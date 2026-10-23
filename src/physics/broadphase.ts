import { nextPow2 } from "../math/scalar.js";
/**
 * What the broadphase reads: positions and radii of bodies, from a BodyStore or the bounding spheres of
 * rigid bodies. Bodies without the Collides flag are left out.
 */
export interface BoundsSource {
  readonly count: number;
  readonly capacity: number;
  readonly maxRadius: number;
  readonly pos: ArrayLike<number>;
  readonly radius: ArrayLike<number>;
  readonly flags: ArrayLike<number>;
  readonly group: Uint8Array;
}
import { BodyFlags } from "./types.js";

export type BroadphaseMode = "accurate" | "sandbox";

export interface BroadphaseOptions {
  /**
   * "accurate" (default) finds every overlapping pair; crowded buckets are sorted and swept so they stay
   * cheap. "sandbox" additionally caps the bodies per bucket and skips the excess (rotating which ones each
   * step): bounded cost no matter what, at the price of some missed collisions.
   */
  mode?: BroadphaseMode;
  /** Grid cell size. Default: just over the largest collision diameter. */
  cellSize?: number;
  /** Bucket size above which a bucket is sorted and swept instead of scanned. Default 24. */
  overloadThreshold?: number;
  /** Sandbox mode: most bodies kept per bucket. Default 16. */
  maxPerCell?: number;
  /** Most pairs per body before pairs are dropped (a memory and time safety valve). Default 64 (accurate), 16 (sandbox). */
  maxPairsPerBody?: number;
}

export interface BroadphaseStats {
  cellSize: number;
  /** Most bodies sharing one hash bucket. */
  maxBucket: number;
  /** Buckets above the overload threshold (sorted in accurate mode, capped in sandbox mode). */
  overloadedBuckets: number;
  /** Narrow-phase distance checks performed. */
  candidateTests: number;
  pairs: number;
  /** Sandbox mode: bodies skipped for body-body collisions this step. */
  droppedBodies: number;
  /** Pairs not reported because the pair budget was exhausted. */
  droppedPairs: number;
  /** True when the pair budget was exhausted. */
  saturated: boolean;
}

/** Contact pairs are reported a little before they touch, so contacts forming during solver iterations are caught. */
const MARGIN = 0.1;

function hash(ix: number, iy: number, iz: number, mask: number): number {
  return (Math.imul(ix, 92837111) ^ Math.imul(iy, 689287499) ^ Math.imul(iz, 283923481)) & mask;
}

/**
 * Uniform grid broadphase over the SoA body store (issue #1). Cells are hashed into a power-of-two table
 * and filled with a counting sort, so a rebuild is O(n) with no strings, Maps or per-frame allocations.
 * Every body looks at the 27 cells around it and each candidate pair is reported exactly once.
 *
 * A plain grid degrades to O(n^2) when many bodies share a bucket. That happens with mixed sizes (cells
 * are sized by the largest body, so many small ones fit in one cell), with hash collisions, and during
 * pile-ups. Crowded buckets are therefore sorted along x and searched with a binary search and a sweep
 * limited by the largest radius in that bucket, which keeps them exact and cheap. Sandbox mode caps them.
 */
export class HashGrid {
  mode: BroadphaseMode;
  overloadThreshold: number;
  maxPerCell: number;
  maxPairsPerBody: number;
  cellSize: number = 0;
  tableSize: number = 0;
  /** Bucket b holds entries[cellStart[b] .. cellEnd[b]). */
  cellStart: Int32Array = new Int32Array(1);
  cellEnd: Int32Array = new Int32Array(0);
  entries: Int32Array = new Int32Array(0);
  /** Bucket of each body, -1 if it does not collide. */
  bodyHash: Int32Array = new Int32Array(0);
  /**
   * Per collision group, a bit mask of the groups it collides with (bit g set: collides with group g).
   * null, the default, means every group collides with every other and costs nothing.
   */
  collisionMask: Uint32Array | null = null;
  /** Results of the last query(). */
  queryResult: Int32Array = new Int32Array(0);
  /** Body index pairs (i < j) found by the last findPairs(). */
  pairs: Int32Array = new Int32Array(0);
  pairCount: number = 0;
  readonly stats: BroadphaseStats = {
    cellSize: 0,
    maxBucket: 0,
    overloadedBuckets: 0,
    candidateTests: 0,
    pairs: 0,
    droppedBodies: 0,
    droppedPairs: 0,
    saturated: false,
  };
  private readonly fixedCellSize: number | null;
  private bucketMaxRadius: Float64Array = new Float64Array(0);
  private bucketSorted: Uint8Array = new Uint8Array(0);
  /** Sandbox mode: bodies left out of their bucket this step. */
  private ghost: Uint8Array = new Uint8Array(0);
  private scratch: Int32Array = new Int32Array(0);
  private stamp: Int32Array = new Int32Array(0);
  private stampValue: number = 0;
  private frame: number = 0;

  constructor(options: BroadphaseOptions = {}) {
    this.mode = options.mode ?? "accurate";
    this.fixedCellSize = options.cellSize ?? null;
    this.overloadThreshold = options.overloadThreshold ?? 24;
    this.maxPerCell = options.maxPerCell ?? 16;
    this.maxPairsPerBody = options.maxPairsPerBody ?? (this.mode === "sandbox" ? 16 : 64);
  }

  /** Bodies i and j become a candidate pair when closer than (r_i + r_j) * contactScale. */
  get contactScale(): number {
    return 1 + MARGIN;
  }

  build(s: BoundsSource): void {
    const n = s.count;
    this.frame++;
    // Cells must span a full contact distance or the 27-cell neighborhood could miss pairs
    const minCell = 2 * s.maxRadius * this.contactScale;
    this.cellSize = Math.max(this.fixedCellSize ?? minCell * 1.05, minCell, 1e-9);
    this.stats.cellSize = this.cellSize;
    this.ensureCapacity(n, s.capacity);

    const mask = this.tableSize - 1;
    const inv = 1 / this.cellSize;
    const pos = s.pos;
    const radius = s.radius;
    const flags = s.flags;
    const { cellStart, cellEnd, bodyHash, bucketMaxRadius, entries } = this;
    cellStart.fill(0);
    bucketMaxRadius.fill(0);

    for (let i = 0; i < n; i++) {
      if (!(flags[i] & BodyFlags.Collides)) {
        bodyHash[i] = -1;
        continue;
      }
      const o = i * 3;
      const h = hash(Math.floor(pos[o] * inv), Math.floor(pos[o + 1] * inv), Math.floor(pos[o + 2] * inv), mask);
      bodyHash[i] = h;
      cellStart[h]++;
      if (radius[i] > bucketMaxRadius[h]) bucketMaxRadius[h] = radius[i];
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
    for (let i = n - 1; i >= 0; i--) {
      const h = bodyHash[i];
      if (h >= 0) entries[--cellStart[h]] = i;
    }
    for (let b = 0; b < this.tableSize; b++) cellEnd[b] = cellStart[b + 1];
    this.stats.maxBucket = maxBucket;

    this.ghost.fill(0, 0, n);
    this.bucketSorted.fill(0);
    this.stats.overloadedBuckets = 0;
    this.stats.droppedBodies = 0;
    if (maxBucket > (this.mode === "sandbox" ? this.maxPerCell : this.overloadThreshold)) {
      if (this.mode === "sandbox") this.capBuckets();
      else this.sortBuckets(pos);
    }
  }

  findPairs(s: BoundsSource): void {
    this.pairCount = 0;
    this.stats.droppedPairs = 0;
    this.stats.saturated = false;
    const n = s.count;
    if (s.maxRadius <= 0) {
      this.stats.candidateTests = 0;
      this.stats.pairs = 0;
      return;
    }
    const pos = s.pos;
    const radius = s.radius;
    const scale = this.contactScale;
    const inv = 1 / this.cellSize;
    const mask = this.tableSize - 1;
    const maxPairs = Math.max(1024, this.maxPairsPerBody * n);
    const { cellStart, cellEnd, entries, bodyHash, bucketMaxRadius, bucketSorted, ghost, stamp } = this;
    let tests = 0;

    for (let i = 0; i < n; i++) {
      if (bodyHash[i] < 0 || ghost[i]) continue;
      const o = i * 3;
      const xi = pos[o];
      const yi = pos[o + 1];
      const zi = pos[o + 2];
      const ri = radius[i];
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
            let k = cellStart[b];
            let end = cellEnd[b];
            if (k === end) continue;

            if (bucketSorted[b]) {
              // Only bodies whose x is within reach can touch: binary search the start, stop past the end
              const reach = (ri + bucketMaxRadius[b]) * scale;
              const lo = xi - reach;
              const top = xi + reach;
              let hi = end;
              while (k < hi) {
                const mid = (k + hi) >>> 1;
                if (pos[entries[mid] * 3] < lo) k = mid + 1;
                else hi = mid;
              }
              let first = k;
              while (first < end) {
                const mid = (first + end) >>> 1;
                if (pos[entries[mid] * 3] <= top) first = mid + 1;
                else end = mid;
              }
            }

            for (; k < end; k++) {
              const j = entries[k];
              if (j <= i) continue;
              tests++;
              const oj = j * 3;
              const ddx = pos[oj] - xi;
              const ddy = pos[oj + 1] - yi;
              const ddz = pos[oj + 2] - zi;
              const rr = (ri + radius[j]) * scale;
              if (ddx * ddx + ddy * ddy + ddz * ddz < rr * rr) {
                if (this.pairCount < maxPairs) this.pushPair(i, j);
                else this.stats.droppedPairs++;
              }
            }
          }
        }
      }
    }
    // Collision groups are filtered afterwards, so the search loop costs nothing extra without them
    if (this.collisionMask !== null) this.filterPairs(s.group, this.collisionMask);
    this.stats.saturated = this.stats.droppedPairs > 0;
    this.stats.candidateTests = tests;
    this.stats.pairs = this.pairCount;
  }

  /**
   * Indices of the bodies in the grid cells around a sphere (x, y, z, r), written to `queryResult`:
   * candidates near it, whose distance the caller still checks. Uses the grid of the last build(); when
   * the sphere spans more cells than there are bodies, scanning them all is cheaper and that is done.
   * Returns the number of candidates.
   */
  query(s: BoundsSource, x: number, y: number, z: number, r: number): number {
    const n = s.count;
    if (n === 0 || this.cellSize <= 0) return 0;
    if (this.queryResult.length < n) this.queryResult = new Int32Array(Math.max(n, this.queryResult.length * 2));
    const out = this.queryResult;
    const inv = 1 / this.cellSize;
    const x0 = Math.floor((x - r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const z0 = Math.floor((z - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y1 = Math.floor((y + r) * inv);
    const z1 = Math.floor((z + r) * inv);
    const cells = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    let k = 0;
    if (cells > n) {
      const pos = s.pos;
      const flags = s.flags;
      const reach = r + s.maxRadius;
      for (let i = 0; i < n; i++) {
        if (!(flags[i] & BodyFlags.Collides)) continue;
        const o = i * 3;
        if (Math.abs(pos[o] - x) > reach || Math.abs(pos[o + 1] - y) > reach || Math.abs(pos[o + 2] - z) > reach) continue;
        out[k++] = i;
      }
      return k;
    }
    const mask = this.tableSize - 1;
    const mark = this.nextStamp();
    const { cellStart, cellEnd, entries, stamp } = this;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cz = z0; cz <= z1; cz++) {
          const b = hash(cx, cy, cz, mask);
          if (stamp[b] === mark) continue;
          stamp[b] = mark;
          for (let e = cellStart[b]; e < cellEnd[b]; e++) out[k++] = entries[e];
        }
      }
    }
    return k;
  }

  /** Drops pairs whose groups don't collide, keeping the rest in order. */
  private filterPairs(group: Uint8Array, masks: Uint32Array): void {
    const pairs = this.pairs;
    let kept = 0;
    for (let p = 0; p < this.pairCount; p++) {
      const i = pairs[p * 2];
      const j = pairs[p * 2 + 1];
      if (((masks[group[i]] >>> group[j]) & 1) === 0) continue;
      pairs[kept * 2] = i;
      pairs[kept * 2 + 1] = j;
      kept++;
    }
    this.pairCount = kept;
  }

  /** Accurate mode: sort crowded buckets by x so findPairs can sweep them. */
  private sortBuckets(pos: ArrayLike<number>): void {
    const { cellStart, cellEnd, entries } = this;
    const byX = (a: number, b: number): number => pos[a * 3] - pos[b * 3];
    let overloaded = 0;
    for (let b = 0; b < this.tableSize; b++) {
      const start = cellStart[b];
      const end = cellEnd[b];
      if (end - start <= this.overloadThreshold) continue;
      entries.subarray(start, end).sort(byX);
      this.bucketSorted[b] = 1;
      overloaded++;
    }
    this.stats.overloadedBuckets = overloaded;
  }

  /**
   * Sandbox mode: keep at most maxPerCell bodies per bucket. The kept window rotates every step, so no body
   * is permanently left out; the rest still hit colliders, they just skip body-body collisions this step.
   */
  private capBuckets(): void {
    const { cellStart, cellEnd, entries, ghost } = this;
    const cap = this.maxPerCell;
    let overloaded = 0;
    let dropped = 0;
    for (let b = 0; b < this.tableSize; b++) {
      const start = cellStart[b];
      const m = cellEnd[b] - start;
      if (m <= cap) continue;
      overloaded++;
      const offset = (this.frame * 7919 + b) % m;
      if (this.scratch.length < m) this.scratch = new Int32Array(m * 2);
      const tmp = this.scratch;
      for (let k = 0; k < m; k++) tmp[k] = entries[start + ((k + offset) % m)];
      for (let k = 0; k < m; k++) {
        entries[start + k] = tmp[k];
        if (k >= cap) ghost[tmp[k]] = 1;
      }
      cellEnd[b] = start + cap;
      dropped += m - cap;
    }
    this.stats.overloadedBuckets = overloaded;
    this.stats.droppedBodies = dropped;
  }

  private ensureCapacity(n: number, capacity: number): void {
    const tableSize = nextPow2(Math.max(1024, 2 * n));
    if (tableSize > this.tableSize) {
      this.tableSize = tableSize;
      this.cellStart = new Int32Array(tableSize + 1);
      this.cellEnd = new Int32Array(tableSize);
      this.bucketMaxRadius = new Float64Array(tableSize);
      this.bucketSorted = new Uint8Array(tableSize);
      this.stamp = new Int32Array(tableSize);
      this.stampValue = 0;
    }
    if (this.entries.length < n) {
      this.entries = new Int32Array(capacity);
      this.bodyHash = new Int32Array(capacity);
      this.ghost = new Uint8Array(capacity);
    }
  }

  private pushPair(i: number, j: number): void {
    if (this.pairCount * 2 + 2 > this.pairs.length) {
      const next = new Int32Array(Math.max(2048, this.pairs.length * 2));
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
