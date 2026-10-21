import { Layer } from "../../scene/nodes.js";

export const PrimitiveKind = { Polygon: 0, Line: 1, Circle: 2, Point: 3, GradientPolygon: 4 } as const;
export type PrimitiveKind = (typeof PrimitiveKind)[keyof typeof PrimitiveKind];

export interface Style {
  readonly fill: string | null;
  readonly stroke: string | null;
  readonly lineWidth: number;
  readonly alpha: number;
}

/** Deduplicates styles so primitives can refer to them by a small integer id. Ids are stable for its lifetime. */
export class StyleTable {
  private readonly ids: Map<string, number> = new Map();
  private readonly list: Style[] = [];

  intern(fill: string | null, stroke: string | null = null, lineWidth: number = 1, alpha: number = 1): number {
    const key = `${fill}|${stroke}|${lineWidth}|${alpha}`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.list.length;
      this.list.push({ fill, stroke, lineWidth, alpha });
      this.ids.set(key, id);
    }
    return id;
  }

  get(id: number): Style {
    return this.list[id];
  }

  get size(): number {
    return this.list.length;
  }
}

const LAYER_UNIT = 2 ** 28;
const DEPTH_UNIT = 2 ** 12;
const KIND_UNIT_SORTED = 2 ** 10;
const KIND_UNIT_UNSORTED = 2 ** 26;

/**
 * The "resolve all" render call (issue #3). Objects no longer draw themselves; they submit screen-space
 * primitives here. The queue sorts them once per frame (back to front inside depth-sorted layers, by style
 * elsewhere) and hands out batches: maximal runs of the same primitive kind and style, which a backend can
 * draw as a single path with one fill/stroke.
 */
export class RenderQueue {
  count: number = 0;
  kind: Uint8Array;
  layer: Uint8Array;
  style: Uint32Array;
  /** View-space depth; larger is farther. */
  depth: Float32Array;
  offset: Uint32Array;
  /** Vertex count for polygons. */
  size: Uint16Array;
  /**
   * Screen-space coordinates, per kind: polygon x,y pairs; line x0,y0,x1,y1; circle x,y,r; point x,y,size;
   * gradient polygon x,y pairs, then the gradient line x0,y0,x1,y1 and its two fine color keys.
   */
  coords: Float32Array;
  coordCount: number = 0;
  /** Primitive indices in draw order, valid after sort(). */
  order: Uint32Array;
  readonly styles: StyleTable = new StyleTable();
  /** Bit mask of layers sorted back to front. */
  depthSortedLayers: number = 1 << Layer.World;
  private keys: Uint32Array;
  private tmp: Uint32Array;
  private readonly counts: Uint32Array = new Uint32Array(256);

  constructor(capacity: number = 1024) {
    this.kind = new Uint8Array(capacity);
    this.layer = new Uint8Array(capacity);
    this.style = new Uint32Array(capacity);
    this.depth = new Float32Array(capacity);
    this.offset = new Uint32Array(capacity);
    this.size = new Uint16Array(capacity);
    this.order = new Uint32Array(capacity);
    this.keys = new Uint32Array(capacity);
    this.tmp = new Uint32Array(capacity);
    this.coords = new Float32Array(capacity * 4);
  }

  reset(): void {
    this.count = 0;
    this.coordCount = 0;
  }

  pushPolygon(layer: number, style: number, depth: number, xy: ArrayLike<number>, n: number): void {
    // Normalize the on-screen winding: same-style polygons share one path, and with the nonzero fill
    // rule two overlapping subpaths of opposite winding would cancel out into a hole.
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) area += xy[j * 2] * xy[i * 2 + 1] - xy[i * 2] * xy[j * 2 + 1];
    if (area === 0 || Number.isNaN(area)) return;
    const o = this.add(PrimitiveKind.Polygon, layer, style, depth, n * 2, n);
    const c = this.coords;
    if (area > 0) {
      for (let i = 0; i < n * 2; i++) c[o + i] = xy[i];
    } else {
      for (let i = 0; i < n; i++) {
        c[o + i * 2] = xy[(n - 1 - i) * 2];
        c[o + i * 2 + 1] = xy[(n - 1 - i) * 2 + 1];
      }
    }
  }

  /**
   * A polygon filled with a linear gradient from color key `from` at (gx0, gy0) to `to` at (gx1, gy1)
   * (keys as made by quantizeFine()). Each one is its own draw call; the style supplies opacity and outline.
   */
  pushGradientPolygon(
    layer: number,
    style: number,
    depth: number,
    xy: ArrayLike<number>,
    n: number,
    gx0: number,
    gy0: number,
    gx1: number,
    gy1: number,
    from: number,
    to: number,
  ): void {
    const o = this.add(PrimitiveKind.GradientPolygon, layer, style, depth, n * 2 + 6, n);
    const c = this.coords;
    for (let i = 0; i < n * 2; i++) c[o + i] = xy[i];
    const g = o + n * 2;
    c[g] = gx0;
    c[g + 1] = gy0;
    c[g + 2] = gx1;
    c[g + 3] = gy1;
    c[g + 4] = from;
    c[g + 5] = to;
  }

  pushLine(layer: number, style: number, depth: number, x0: number, y0: number, x1: number, y1: number): void {
    const o = this.add(PrimitiveKind.Line, layer, style, depth, 4, 2);
    const c = this.coords;
    c[o] = x0;
    c[o + 1] = y0;
    c[o + 2] = x1;
    c[o + 3] = y1;
  }

  pushCircle(layer: number, style: number, depth: number, x: number, y: number, r: number): void {
    const o = this.add(PrimitiveKind.Circle, layer, style, depth, 3, 1);
    const c = this.coords;
    c[o] = x;
    c[o + 1] = y;
    c[o + 2] = r;
  }

  pushPoint(layer: number, style: number, depth: number, x: number, y: number, size: number): void {
    const o = this.add(PrimitiveKind.Point, layer, style, depth, 3, 1);
    const c = this.coords;
    c[o] = x;
    c[o + 1] = y;
    c[o + 2] = size;
  }

  /** Orders primitives by layer, then far-to-near (sorted layers) or kind and style (other layers). */
  sort(): void {
    const n = this.count;
    if (n === 0) return;
    const { kind, layer, style, depth, keys } = this;
    const sorted = this.depthSortedLayers;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      if ((sorted >> layer[i]) & 1) {
        const d = depth[i];
        if (d < min) min = d;
        if (d > max) max = d;
      }
    }
    const scale = max > min ? 65535 / (max - min) : 0;

    for (let i = 0; i < n; i++) {
      const l = layer[i];
      if ((sorted >> l) & 1) {
        const q = Math.floor((max - depth[i]) * scale);
        keys[i] = l * LAYER_UNIT + q * DEPTH_UNIT + kind[i] * KIND_UNIT_SORTED + (style[i] & 1023);
      } else {
        keys[i] = l * LAYER_UNIT + kind[i] * KIND_UNIT_UNSORTED + (style[i] & (KIND_UNIT_UNSORTED - 1));
      }
      this.order[i] = i;
    }
    this.radixSort(n);
  }

  /** Calls back once per batch with the range [start, end) of `order`. Returns the number of batches. */
  forEachBatch(cb: (kind: PrimitiveKind, style: number, start: number, end: number) => void): number {
    const n = this.count;
    if (n === 0) return 0;
    const { order, kind, style } = this;
    let batches = 0;
    let start = 0;
    let k0 = kind[order[0]];
    let s0 = style[order[0]];
    for (let i = 1; i <= n; i++) {
      if (i === n || kind[order[i]] !== k0 || style[order[i]] !== s0) {
        cb(k0 as PrimitiveKind, s0, start, i);
        batches++;
        if (i < n) {
          start = i;
          k0 = kind[order[i]];
          s0 = style[order[i]];
        }
      }
    }
    return batches;
  }

  /** Stable LSD radix sort of `order` by `keys`, 8 bits per pass, skipping passes where all digits match. */
  private radixSort(n: number): void {
    const keys = this.keys;
    const counts = this.counts;
    let src = this.order;
    let dst = this.tmp;
    for (let shift = 0; shift < 32; shift += 8) {
      counts.fill(0);
      for (let i = 0; i < n; i++) counts[(keys[src[i]] >>> shift) & 255]++;
      if (counts[(keys[src[0]] >>> shift) & 255] === n) continue;
      let sum = 0;
      for (let b = 0; b < 256; b++) {
        const c = counts[b];
        counts[b] = sum;
        sum += c;
      }
      for (let i = 0; i < n; i++) {
        const k = src[i];
        dst[counts[(keys[k] >>> shift) & 255]++] = k;
      }
      const t = src;
      src = dst;
      dst = t;
    }
    if (src !== this.order) this.order.set(src.subarray(0, n));
  }

  private add(kind: number, layer: number, style: number, depth: number, nCoords: number, size: number): number {
    if (this.count === this.kind.length) this.grow();
    if (this.coordCount + nCoords > this.coords.length) {
      const next = new Float32Array(Math.max(this.coords.length * 2, this.coordCount + nCoords));
      next.set(this.coords.subarray(0, this.coordCount));
      this.coords = next;
    }
    const i = this.count++;
    this.kind[i] = kind;
    this.layer[i] = layer;
    this.style[i] = style;
    this.depth[i] = depth;
    this.offset[i] = this.coordCount;
    this.size[i] = size;
    const o = this.coordCount;
    this.coordCount += nCoords;
    return o;
  }

  private grow(): void {
    const cap = this.kind.length * 2;
    const grow = <T extends Uint8Array | Uint16Array | Uint32Array | Float32Array>(a: T, make: (n: number) => T): T => {
      const next = make(cap);
      next.set(a);
      return next;
    };
    this.kind = grow(this.kind, (n) => new Uint8Array(n));
    this.layer = grow(this.layer, (n) => new Uint8Array(n));
    this.style = grow(this.style, (n) => new Uint32Array(n));
    this.depth = grow(this.depth, (n) => new Float32Array(n));
    this.offset = grow(this.offset, (n) => new Uint32Array(n));
    this.size = grow(this.size, (n) => new Uint16Array(n));
    this.order = new Uint32Array(cap);
    this.keys = new Uint32Array(cap);
    this.tmp = new Uint32Array(cap);
  }
}
