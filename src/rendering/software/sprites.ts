/** Everything a lit sphere sprite's pixels depend on. Colors are 0..1 per channel. */
export interface SpriteParams {
  baseR: number;
  baseG: number;
  baseB: number;
  /** Uniform light: ambient, hemisphere and the lights other than the dominant one. */
  ambientR: number;
  ambientG: number;
  ambientB: number;
  /** The dominant light's color times its strength at the sphere. */
  lightR: number;
  lightG: number;
  lightB: number;
  /** Unit direction toward the dominant light in view space (x right, y up, z into the screen). */
  lx: number;
  ly: number;
  lz: number;
  specular: number;
  shininess: number;
}

/**
 * Sprite ids for the frames' lit spheres, with the parameters to draw them. The software pipeline only
 * decides which sprite a sphere uses; a backend turns ids into images (see SpriteCache). Ids are stable.
 */
export class SpriteTable {
  /** Bumped by clear(): ids from before then mean something else, so image caches must drop them. */
  generation: number = 0;
  private readonly list: SpriteParams[] = [];

  add(params: SpriteParams): number {
    this.list.push(params);
    return this.list.length - 1;
  }

  /** Forgets every sprite (the emitter does this when the table grows too large). */
  clear(): void {
    this.list.length = 0;
    this.generation++;
  }

  get(id: number): SpriteParams {
    return this.list[id];
  }

  get size(): number {
    return this.list.length;
  }
}

/**
 * Renders a lit sphere into RGBA pixels (size x size, row-major): per-pixel Lambert from the dominant
 * light plus the uniform ambient term, a Blinn-Phong highlight, and an anti-aliased edge. The viewer
 * looks along +z, so the visible hemisphere's normals point toward -z.
 */
export function renderSprite(p: SpriteParams, size: number, out: Uint8ClampedArray): void {
  const c = size / 2;
  const r = size / 2;
  // Half vector between the light and the viewer (0, 0, -1)
  let hx = p.lx;
  let hy = p.ly;
  let hz = p.lz - 1;
  const hl = Math.hypot(hx, hy, hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = (py * size + px) * 4;
      const x = (px + 0.5 - c) / r;
      const y = -(py + 0.5 - c) / r;
      const d2 = x * x + y * y;
      const dist = Math.sqrt(d2) * r;
      // Coverage of the pixel by the disk, for a smooth edge
      const alpha = Math.min(Math.max(r - dist + 0.5, 0), 1);
      if (alpha <= 0) {
        out[o + 3] = 0;
        continue;
      }
      const nz = -Math.sqrt(Math.max(1 - d2, 0));
      const ndl = x * p.lx + y * p.ly + nz * p.lz;
      const diffuse = ndl > 0 ? ndl : 0;
      let spec = 0;
      if (p.specular > 0 && ndl > 0) {
        const ndh = x * hx + y * hy + nz * hz;
        if (ndh > 0) spec = p.specular * ndh ** p.shininess;
      }
      out[o] = 255 * (p.baseR * (p.ambientR + p.lightR * diffuse) + p.lightR * spec);
      out[o + 1] = 255 * (p.baseG * (p.ambientG + p.lightG * diffuse) + p.lightG * spec);
      out[o + 2] = 255 * (p.baseB * (p.ambientB + p.lightB * diffuse) + p.lightB * spec);
      out[o + 3] = 255 * alpha;
    }
  }
}

/** Average color of a sprite (for drawing it as a plain circle when no images are available). */
export function spriteAverage(p: SpriteParams, out: { r: number; g: number; b: number }): void {
  // The visible disk of a Lambert sphere averages about half the light facing the viewer
  const facing = Math.max(0, (1 - p.lz) / 2);
  out.r = p.baseR * (p.ambientR + p.lightR * facing * 0.67);
  out.g = p.baseG * (p.ambientG + p.lightG * facing * 0.67);
  out.b = p.baseB * (p.ambientB + p.lightB * facing * 0.67);
}
