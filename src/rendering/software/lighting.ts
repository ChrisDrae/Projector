import type { Mat4 } from "../../math/mat4.js";
import { attenuation } from "../../scene/light.js";
import type { Scene } from "../../scene/scene.js";
import { colorOf } from "../color.js";

/** Lights beyond this many are ignored. */
export const MAX_LIGHTS = 8;

/** Light on a sphere, split into its strongest light and a uniform rest (see Lighting.sphere). */
export interface SphereLight {
  ambientR: number;
  ambientG: number;
  ambientB: number;
  lightR: number;
  lightG: number;
  lightB: number;
  lx: number;
  ly: number;
  lz: number;
  phase: number;
}

const DIRECTIONAL = 0;
const POINT = 1;
const SPOT = 2;

/**
 * The scene's lights in view space for one frame, and the shading math. Colors are 0..1 per channel and
 * light colors are premultiplied by intensity. Shading happens in the same (sRGB) space as the colors,
 * like the original brightness model, so adding a light never changes how the rest of a scene looks.
 */
export class Lighting {
  /**
   * Only white ambient and white directional lights, no fog: faces can use the cheap brightness model,
   * quantized to SHADE_LEVELS shades of their color (what scenes without any new lighting features get).
   */
  simple: boolean = true;
  ambient: number = 0;
  count: number = 0;
  /** Shading result of the last shade() call, 0..1+ per channel. */
  r: number = 0;
  g: number = 0;
  b: number = 0;
  fog: boolean = false;
  fogNear: number = 0;
  fogFar: number = 1;
  fogR: number = 0;
  fogG: number = 0;
  fogB: number = 0;
  fogCss: string = "";
  private ambR: number = 0;
  private ambG: number = 0;
  private ambB: number = 0;
  private hemi: boolean = false;
  private skyR: number = 0;
  private skyG: number = 0;
  private skyB: number = 0;
  private groundR: number = 0;
  private groundG: number = 0;
  private groundB: number = 0;
  private upX: number = 0;
  private upY: number = 1;
  private upZ: number = 0;
  private readonly type: Uint8Array = new Uint8Array(MAX_LIGHTS);
  private readonly color: Float64Array = new Float64Array(3 * MAX_LIGHTS);
  /** Directional: unit vector toward the light. Spot: unit direction the light shines in. */
  private readonly dir: Float64Array = new Float64Array(3 * MAX_LIGHTS);
  private readonly pos: Float64Array = new Float64Array(3 * MAX_LIGHTS);
  private readonly range: Float64Array = new Float64Array(MAX_LIGHTS);
  private readonly decay: Float64Array = new Float64Array(MAX_LIGHTS);
  private readonly cosOuter: Float64Array = new Float64Array(MAX_LIGHTS);
  private readonly cosInner: Float64Array = new Float64Array(MAX_LIGHTS);
  private readonly intensity: Float64Array = new Float64Array(MAX_LIGHTS);
  private readonly sphereTmp: Float64Array = new Float64Array(4 * MAX_LIGHTS);

  update(scene: Scene, v: Mat4): void {
    const amb = scene.ambient;
    const ac = colorOf(amb.color);
    this.ambient = amb.intensity;
    this.ambR = (ac.r / 255) * amb.intensity;
    this.ambG = (ac.g / 255) * amb.intensity;
    this.ambB = (ac.b / 255) * amb.intensity;
    let simple = ac.r === 255 && ac.g === 255 && ac.b === 255;
    this.hemi = false;
    this.count = 0;

    for (const light of scene.lights) {
      if (light.kind === "hemisphere") {
        // Several hemisphere lights would just add up; one is all a scene needs
        const sky = colorOf(light.sky);
        const ground = colorOf(light.ground);
        const k = light.intensity / 255;
        this.skyR = sky.r * k;
        this.skyG = sky.g * k;
        this.skyB = sky.b * k;
        this.groundR = ground.r * k;
        this.groundG = ground.g * k;
        this.groundB = ground.b * k;
        this.upX = v[4];
        this.upY = v[5];
        this.upZ = v[6];
        this.hemi = true;
        simple = false;
        continue;
      }
      if (this.count === MAX_LIGHTS) continue;
      const l = this.count++;
      const c = colorOf(light.color);
      const k = light.intensity / 255;
      this.color[l * 3] = c.r * k;
      this.color[l * 3 + 1] = c.g * k;
      this.color[l * 3 + 2] = c.b * k;
      this.intensity[l] = light.intensity;
      if (light.kind === "directional") {
        if (c.r !== 255 || c.g !== 255 || c.b !== 255) simple = false;
        this.type[l] = DIRECTIONAL;
        const d = light.direction;
        this.setDir(l, v, -d.x, -d.y, -d.z);
        continue;
      }
      simple = false;
      const p = light.position;
      this.pos[l * 3] = v[0] * p.x + v[4] * p.y + v[8] * p.z + v[12];
      this.pos[l * 3 + 1] = v[1] * p.x + v[5] * p.y + v[9] * p.z + v[13];
      this.pos[l * 3 + 2] = v[2] * p.x + v[6] * p.y + v[10] * p.z + v[14];
      this.range[l] = light.distance;
      this.decay[l] = light.decay;
      if (light.kind === "point") {
        this.type[l] = POINT;
      } else {
        this.type[l] = SPOT;
        const d = light.direction;
        this.setDir(l, v, d.x, d.y, d.z);
        this.cosOuter[l] = Math.cos(light.angle);
        this.cosInner[l] = Math.cos(light.angle * (1 - Math.min(Math.max(light.penumbra, 0), 1)));
      }
    }

    const fog = scene.fog;
    this.fog = fog !== null;
    if (fog) {
      simple = false;
      const f = colorOf(fog.color);
      this.fogR = f.r / 255;
      this.fogG = f.g / 255;
      this.fogB = f.b / 255;
      this.fogNear = fog.near;
      this.fogFar = fog.far;
      this.fogCss = fog.color;
    }
    this.simple = simple;
  }

  /** The original model: ambient plus Lambert of the directional lights, as a 0..1 brightness. */
  brightness(nx: number, ny: number, nz: number): number {
    let sum = this.ambient;
    for (let l = 0; l < this.count; l++) {
      if (this.type[l] !== DIRECTIONAL) continue;
      const facing = nx * this.dir[l * 3] + ny * this.dir[l * 3 + 1] + nz * this.dir[l * 3 + 2];
      if (facing > 0) sum += facing * this.intensity[l];
    }
    return sum < 0 ? 0 : sum > 1 ? 1 : sum;
  }

  /**
   * Lit color of a surface point p with unit normal n (both in view space) into r, g, b: base color times
   * the ambient, hemisphere and diffuse light, plus Blinn-Phong highlights and the emissive color, then fog.
   */
  shade(
    nx: number,
    ny: number,
    nz: number,
    px: number,
    py: number,
    pz: number,
    baseR: number,
    baseG: number,
    baseB: number,
    specular: number,
    shininess: number,
    emR: number,
    emG: number,
    emB: number,
  ): void {
    let dr = this.ambR;
    let dg = this.ambG;
    let db = this.ambB;
    if (this.hemi) {
      const w = 0.5 + 0.5 * (nx * this.upX + ny * this.upY + nz * this.upZ);
      dr += this.groundR + (this.skyR - this.groundR) * w;
      dg += this.groundG + (this.skyG - this.groundG) * w;
      db += this.groundB + (this.skyB - this.groundB) * w;
    }
    let sr = 0;
    let sg = 0;
    let sb = 0;
    // Toward the camera, which sits at the view-space origin
    let vx = 0;
    let vy = 0;
    let vz = 0;
    if (specular > 0) {
      const len = Math.hypot(px, py, pz) || 1;
      vx = -px / len;
      vy = -py / len;
      vz = -pz / len;
    }

    for (let l = 0; l < this.count; l++) {
      const t = this.type[l];
      let lx: number;
      let ly: number;
      let lz: number;
      let att = 1;
      if (t === DIRECTIONAL) {
        lx = this.dir[l * 3];
        ly = this.dir[l * 3 + 1];
        lz = this.dir[l * 3 + 2];
      } else {
        const dx = this.pos[l * 3] - px;
        const dy = this.pos[l * 3 + 1] - py;
        const dz = this.pos[l * 3 + 2] - pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        lx = dx / d;
        ly = dy / d;
        lz = dz / d;
        att = attenuation(d, this.range[l], this.decay[l]);
        if (t === SPOT) {
          const c = -(lx * this.dir[l * 3] + ly * this.dir[l * 3 + 1] + lz * this.dir[l * 3 + 2]);
          const outer = this.cosOuter[l];
          const inner = this.cosInner[l];
          if (c <= outer) continue;
          if (c < inner) {
            const s = (c - outer) / (inner - outer);
            att *= s * s * (3 - 2 * s);
          }
        }
      }
      const ndl = nx * lx + ny * ly + nz * lz;
      if (ndl <= 0) continue;
      const k = ndl * att;
      dr += this.color[l * 3] * k;
      dg += this.color[l * 3 + 1] * k;
      db += this.color[l * 3 + 2] * k;
      if (specular > 0) {
        let hx = lx + vx;
        let hy = ly + vy;
        let hz = lz + vz;
        const hl = Math.hypot(hx, hy, hz) || 1;
        hx /= hl;
        hy /= hl;
        hz /= hl;
        const ndh = nx * hx + ny * hy + nz * hz;
        if (ndh > 0) {
          const s = specular * ndh ** shininess * att;
          sr += this.color[l * 3] * s;
          sg += this.color[l * 3 + 1] * s;
          sb += this.color[l * 3 + 2] * s;
        }
      }
    }

    let r = baseR * dr + sr + emR;
    let g = baseG * dg + sg + emG;
    let b = baseB * db + sb + emB;
    if (this.fog) {
      const f = this.fogFactor(pz);
      r += (this.fogR - r) * f;
      g += (this.fogG - g) * f;
      b += (this.fogB - b) * f;
    }
    this.r = r;
    this.g = g;
    this.b = b;
  }

  /**
   * Light on a sphere centered at p (view space), split for sprites: the strongest light (color times
   * strength in lightR/G/B, direction toward it in lx/ly/lz) and everything else as one uniform term
   * (ambientR/G/B: ambient, the hemisphere's middle, the other lights by how much of the visible side
   * they reach). `phase` is the part of the visible side the strongest light reaches (0..1).
   */
  sphere(px: number, py: number, pz: number, out: SphereLight): void {
    let ar = this.ambR;
    let ag = this.ambG;
    let ab = this.ambB;
    if (this.hemi) {
      ar += (this.skyR + this.groundR) / 2;
      ag += (this.skyG + this.groundG) / 2;
      ab += (this.skyB + this.groundB) / 2;
    }
    const len = Math.hypot(px, py, pz) || 1;
    const vx = -px / len;
    const vy = -py / len;
    const vz = -pz / len;
    const tmp = this.sphereTmp;
    let best = -1;
    let bestWeight = 0;
    for (let l = 0; l < this.count; l++) {
      const t = this.type[l];
      let lx: number;
      let ly: number;
      let lz: number;
      let att = 1;
      if (t === DIRECTIONAL) {
        lx = this.dir[l * 3];
        ly = this.dir[l * 3 + 1];
        lz = this.dir[l * 3 + 2];
      } else {
        const dx = this.pos[l * 3] - px;
        const dy = this.pos[l * 3 + 1] - py;
        const dz = this.pos[l * 3 + 2] - pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        lx = dx / d;
        ly = dy / d;
        lz = dz / d;
        att = attenuation(d, this.range[l], this.decay[l]);
        if (t === SPOT) {
          const c = -(lx * this.dir[l * 3] + ly * this.dir[l * 3 + 1] + lz * this.dir[l * 3 + 2]);
          const outer = this.cosOuter[l];
          const inner = this.cosInner[l];
          if (c <= outer) att = 0;
          else if (c < inner) {
            const s = (c - outer) / (inner - outer);
            att *= s * s * (3 - 2 * s);
          }
        }
      }
      tmp[l * 4] = lx;
      tmp[l * 4 + 1] = ly;
      tmp[l * 4 + 2] = lz;
      tmp[l * 4 + 3] = att;
      const weight = att * (this.color[l * 3] + this.color[l * 3 + 1] + this.color[l * 3 + 2]);
      if (weight > bestWeight) {
        bestWeight = weight;
        best = l;
      }
    }
    for (let l = 0; l < this.count; l++) {
      if (l === best) continue;
      const phase = (1 + tmp[l * 4] * vx + tmp[l * 4 + 1] * vy + tmp[l * 4 + 2] * vz) / 2;
      const k = tmp[l * 4 + 3] * phase;
      ar += this.color[l * 3] * k;
      ag += this.color[l * 3 + 1] * k;
      ab += this.color[l * 3 + 2] * k;
    }
    out.ambientR = ar;
    out.ambientG = ag;
    out.ambientB = ab;
    if (best < 0) {
      out.lightR = 0;
      out.lightG = 0;
      out.lightB = 0;
      out.lx = 0;
      out.ly = 0;
      out.lz = -1;
      out.phase = 0;
      return;
    }
    const att = tmp[best * 4 + 3];
    out.lightR = this.color[best * 3] * att;
    out.lightG = this.color[best * 3 + 1] * att;
    out.lightB = this.color[best * 3 + 2] * att;
    out.lx = tmp[best * 4];
    out.ly = tmp[best * 4 + 1];
    out.lz = tmp[best * 4 + 2];
    out.phase = (1 + out.lx * vx + out.ly * vy + out.lz * vz) / 2;
  }

  /** 0 (no fog) to 1 (fully fogged) at a view depth. */
  fogFactor(depth: number): number {
    if (!this.fog) return 0;
    const f = (depth - this.fogNear) / (this.fogFar - this.fogNear);
    return f <= 0 ? 0 : f >= 1 ? 1 : f;
  }

  private setDir(l: number, v: Mat4, x: number, y: number, z: number): void {
    const vx = v[0] * x + v[4] * y + v[8] * z;
    const vy = v[1] * x + v[5] * y + v[9] * z;
    const vz = v[2] * x + v[6] * y + v[10] * z;
    const len = Math.hypot(vx, vy, vz) || 1;
    this.dir[l * 3] = vx / len;
    this.dir[l * 3 + 1] = vy / len;
    this.dir[l * 3 + 2] = vz / len;
  }
}

function level5(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 31 : Math.round(x * 31);
}

/** Packs a 0..1 color into 5 bits per channel: the key of a quantized lit color. */
export function quantize(r: number, g: number, b: number): number {
  return (level5(r) << 10) | (level5(g) << 5) | level5(b);
}

/** CSS color of a quantized key. */
export function quantizedCss(key: number): string {
  const ch = (v: number): number => Math.round((v * 255) / 31);
  return `rgb(${ch((key >> 10) & 31)}, ${ch((key >> 5) & 31)}, ${ch(key & 31)})`;
}

function level6(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 63 : Math.round(x * 63);
}

/**
 * 6 bits per channel: the finer key smooth shading uses, where neighboring faces blend into each other
 * and 5-bit steps would show as seams in dark tones.
 */
export function quantizeFine(r: number, g: number, b: number): number {
  return (level6(r) << 12) | (level6(g) << 6) | level6(b);
}

/** CSS color of a fine key. */
export function fineCss(key: number): string {
  const ch = (v: number): number => Math.round((v * 255) / 63);
  return `rgb(${ch((key >> 12) & 63)}, ${ch((key >> 6) & 63)}, ${ch(key & 63)})`;
}
