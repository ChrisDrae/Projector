/**
 * Perlin noise — Ken Perlin's "improved noise" (2002), 2D and 3D.
 *
 * Zero dependencies, deterministic for a given seed.
 * Output range is approximately [-1, 1] (extremes are rare in practice).
 *
 *   const noise = new PerlinNoise("my-seed");
 *   noise.noise2D(x / 64, y / 64);          // single octave
 *   noise.fbm2D(x / 64, y / 64, { octaves: 5 });  // fractal / "cloudy"
 */

// ---------------------------------------------------------------- internals

/** 6t^5 - 15t^4 + 10t^3 — smooth, with zero 1st and 2nd derivatives at 0 and 1. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/** Dot product with one of 4 diagonal gradients (±1, ±1). */
function grad2(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    default:
      return -x - y;
  }
}

/** Dot product with one of the 12 cube-edge gradients. */
function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** 3D gradients are longer than 2D ones; rescale so both land in ~[-1, 1]. */
const SCALE_3D = 1 / Math.SQRT2;

/** Small, fast, seedable PRNG — only used to shuffle the permutation table. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, so string seeds work as well as numeric ones. */
function hashSeed(seed: number | string): number {
  if (typeof seed === "number") return Math.floor(seed) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ------------------------------------------------------------------- public

export interface FbmOptions {
  /** Number of noise layers summed together. Default 4. */
  octaves?: number;
  /** Frequency of the first octave. Default 1. */
  frequency?: number;
  /** Frequency multiplier per octave. Default 2. */
  lacunarity?: number;
  /** Amplitude multiplier per octave. Default 0.5. */
  persistence?: number;
}

export class PerlinNoise {
  /** 512 entries: the 0–255 permutation, duplicated to avoid index wrapping. */
  private readonly perm: Uint8Array;

  constructor(seed: number | string = 0) {
    const rand = mulberry32(hashSeed(seed));
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher–Yates
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** 2D Perlin noise. Integer coordinates always return 0 — scale your inputs. */
  noise2D(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;

    const u = fade(xf);
    const v = fade(yf);

    const p = this.perm;
    const a = p[X] + Y;
    const b = p[X + 1] + Y;

    const x1 = lerp(grad2(p[a], xf, yf), grad2(p[b], xf - 1, yf), u);
    const x2 = lerp(grad2(p[a + 1], xf, yf - 1), grad2(p[b + 1], xf - 1, yf - 1), u);

    return lerp(x1, x2, v);
  }

  /** 3D Perlin noise. Useful for volumes, or 2D noise animated over time (z). */
  noise3D(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;

    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const p = this.perm;
    const a = p[X] + Y;
    const aa = p[a] + Z;
    const ab = p[a + 1] + Z;
    const b = p[X + 1] + Y;
    const ba = p[b] + Z;
    const bb = p[b + 1] + Z;

    const x1 = lerp(grad3(p[aa], xf, yf, zf), grad3(p[ba], xf - 1, yf, zf), u);
    const x2 = lerp(grad3(p[ab], xf, yf - 1, zf), grad3(p[bb], xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);

    const x3 = lerp(grad3(p[aa + 1], xf, yf, zf - 1), grad3(p[ba + 1], xf - 1, yf, zf - 1), u);
    const x4 = lerp(
      grad3(p[ab + 1], xf, yf - 1, zf - 1),
      grad3(p[bb + 1], xf - 1, yf - 1, zf - 1),
      u,
    );
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w) * SCALE_3D;
  }

  /** Fractal Brownian motion: several octaves of 2D noise stacked. Range ~[-1, 1]. */
  fbm2D(x: number, y: number, options: FbmOptions = {}): number {
    const { octaves = 4, frequency = 1, lacunarity = 2, persistence = 0.5 } = options;

    let freq = frequency;
    let amp = 1;
    let sum = 0;
    let norm = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * freq, y * freq) * amp;
      norm += amp;
      freq *= lacunarity;
      amp *= persistence;
    }

    return norm === 0 ? 0 : sum / norm;
  }

  /** Fractal Brownian motion in 3D. Range ~[-1, 1]. */
  fbm3D(x: number, y: number, z: number, options: FbmOptions = {}): number {
    const { octaves = 4, frequency = 1, lacunarity = 2, persistence = 0.5 } = options;

    let freq = frequency;
    let amp = 1;
    let sum = 0;
    let norm = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.noise3D(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      freq *= lacunarity;
      amp *= persistence;
    }

    return norm === 0 ? 0 : sum / norm;
  }
}

/** Map noise output from [-1, 1] to [0, 1] (for colours, heights, alpha, ...). */
export function toUnit(n: number): number {
  return n * 0.5 + 0.5;
}

/** Shared instance for when you don't care about seeding. */
export const perlin = new PerlinNoise();

export default PerlinNoise;