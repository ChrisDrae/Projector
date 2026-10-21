/** Color with 0-255 channels. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  lime: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
};

const cache = new Map<string, RGB>();

function hue(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function parseUncached(css: string): RGB {
  const s = css.trim().toLowerCase();
  if (NAMED[s]) return parseUncached(NAMED[s]);

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter((p) => p.length > 0);
    if (fn[1].startsWith("rgb")) {
      const ch = (p: string): number => (p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p));
      return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]) };
    }
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
    const sat = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if (sat === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    return { r: hue(p, q, h + 1 / 3) * 255, g: hue(p, q, h) * 255, b: hue(p, q, h - 1 / 3) * 255 };
  }

  // Unknown color: make it obvious rather than silently black
  return { r: 255, g: 0, b: 255 };
}

/** Parses hex, rgb()/rgba(), hsl()/hsla() and a few named colors (alpha is ignored). */
export function parseColor(css: string): RGB {
  let c = cache.get(css);
  if (!c) {
    c = parseUncached(css);
    cache.set(css, c);
  }
  return { r: c.r, g: c.g, b: c.b };
}

export function toCss(c: RGB): string {
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Multiplies each channel by k (k < 1 darkens). */
export function shade(c: RGB, k: number): RGB {
  return { r: c.r * k, g: c.g * k, b: c.b * k };
}
