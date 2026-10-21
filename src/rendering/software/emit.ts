import * as mat4 from "../../math/mat4.js";
import type { Mat4 } from "../../math/mat4.js";
import type { PerspectiveCamera } from "../../scene/camera.js";
import type { Material } from "../../scene/material.js";
import type { Mesh } from "../../scene/mesh.js";
import { Layer, type LineSet, type MeshNode, type PointCloud, type SortMode, type SphereCloud } from "../../scene/nodes.js";
import type { Scene } from "../../scene/scene.js";
import { colorOf, mix, parseColor, shade, toCss, type RGB } from "../color.js";
import { clipPolygonNear, clipSegmentNear } from "./clip.js";
import { triangleGradient } from "./gradient.js";
import { Lighting, fineCss, quantize, quantizeFine, quantizedCss, type SphereLight } from "./lighting.js";
import { ShadowProjector } from "./shadows.js";
import { createProjection, updateProjection, type ProjectionParams } from "./projection.js";
import { RenderQueue } from "./renderQueue.js";

/** Quantized brightness levels for flat shading (each level is one style, so this bounds the batch count). */
export const SHADE_LEVELS = 32;
/** Quantized fog levels for lines. */
const FOG_LEVELS = 16;
/** Gradient triangles are grown by this many pixels so anti-aliasing doesn't open seams between them. */
const SEAM = 0.35;

interface MeshStyles {
  color: string;
  edgeColor: string | null;
  lineWidth: number;
  opacity: number;
  edges: boolean;
  emissive: string | null;
  /** Brightness model: one style per shade of the base color. */
  faces: Int32Array;
  line: number;
  /** Base and emissive color, 0..1 per channel. */
  baseR: number;
  baseG: number;
  baseB: number;
  emR: number;
  emG: number;
  emB: number;
  edgeCss: string | null;
  /** Full lighting model: quantized color key -> style id (-1 until first used), shared by alike materials. */
  lut: Int32Array;
  /** The same for fine (6-bit) keys, made when a smooth material first needs it. */
  fineLut: Int32Array | null;
  lutKey: string;
  /** Line styles per fog level, for the fog color they were made with. */
  lineFog: Int32Array | null;
  lineFogCss: string;
}

interface CloudStyles {
  key: string;
  ids: Int32Array;
}

/** Per lit sphere cloud: palette colors and the sprites made for it so far. */
interface LitCloud {
  palette: string[];
  base: Float64Array;
  specular: number;
  shininess: number;
  /** Sprite ids by key: (color, light direction, light strength), then the ambient term. */
  sprites: Map<number, Map<number, number>>;
  generation: number;
}

/** The sprite table starts over beyond this many sprites, so long runs with moving lights stay bounded. */
const MAX_SPRITES = 20000;
/** Light directions are quantized for sprites: 24 around the view axis times 8 from front to back. */
const AZIMUTHS = 24;
const ELEVATIONS = 8;

/** Bin of a unit view-space direction toward a light. */
function lightBin(lx: number, ly: number, lz: number): number {
  const e = Math.round(((1 - lz) / 2) * (ELEVATIONS - 1));
  let a = Math.round((Math.atan2(ly, lx) / (2 * Math.PI)) * AZIMUTHS);
  if (a < 0) a += AZIMUTHS;
  if (a >= AZIMUTHS) a = 0;
  return e * AZIMUTHS + a;
}

/** 4-bit level of a value in [0, 1]. */
function level15(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 15 : Math.round(x * 15);
}

/** Light strength on sprites goes up to 2 (over-bright), the uniform part up to 1. */
const SPRITE_LIGHT_MAX = 2;
/** Sprite keys: light key (hue 12 bits + strength 4 bits) below the color and direction. */
const LIGHT_KEYS = 65536;

/**
 * Key of the strongest light on a sprite: its hue (4 bits per channel, scaled to the brightest
 * channel) and its strength (4 bits on a square-root scale, fine where it's dim). Light moving past a
 * sphere mostly changes the strength, so splitting it from the hue keeps sprites shared.
 */
function spriteLightKey(r: number, g: number, b: number): number {
  const m = Math.max(r, g, b);
  if (!(m > 1e-4)) return 0;
  const hue = (level15(r / m) << 8) | (level15(g / m) << 4) | level15(b / m);
  const strength = Math.max(1, level15(Math.sqrt(Math.min(m, SPRITE_LIGHT_MAX) / SPRITE_LIGHT_MAX)));
  return (hue << 4) | strength;
}

/**
 * What a CustomNode draws with. Everything is in world space; the context transforms to view space,
 * clips against the near plane, projects and submits batched primitives, like the built-in nodes.
 */
export interface EmitContext {
  readonly camera: PerspectiveCamera;
  readonly proj: ProjectionParams;
  readonly queue: RenderQueue;
  /** Interns a style and returns its id. Ids are stable, so look them up once and keep them. */
  style(fill: string | null, stroke?: string | null, lineWidth?: number, alpha?: number): number;
  /** Draws a mesh with a world matrix, shaded and culled like a MeshNode. */
  drawMesh(mesh: Mesh, material: Material, world: Mat4, layer?: number, sortMode?: SortMode): void;
  /** Polygon from n xyz triplets, unshaded. Returns false when it was culled. */
  polygon3D(layer: number, style: number, xyz: ArrayLike<number>, n: number): boolean;
  line3D(layer: number, style: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean;
  /** Sphere of radius r drawn as a perspective-sized circle. */
  circle3D(layer: number, style: number, x: number, y: number, z: number, r: number): boolean;
  /** Screen position of a world point in `out`; returns its view depth, or -1 behind the near plane. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): number;
  /** Lambert brightness in [0, 1] of a world-space unit normal under the scene lights. */
  brightness(nx: number, ny: number, nz: number): number;
  /**
   * Fill style of a surface with this material at world point (x, y, z) with world-space unit normal n,
   * under all scene lights and fog: for custom geometry shaded like meshes.
   */
  litStyle(material: Material, nx: number, ny: number, nz: number, x: number, y: number, z: number): number;
}

/**
 * The software pipeline in front of a 2D rasterizer. For every node it transforms to view space, culls
 * back faces and anything behind the camera, clips against the near plane, shades faces, projects with
 * x' = x / z, y' = y / z and submits the result to a RenderQueue.
 */
export class SoftwareEmitter implements EmitContext {
  readonly queue: RenderQueue;
  readonly proj: ProjectionParams = createProjection();
  culled: number = 0;
  /** The camera of the frame being emitted (set by begin()). */
  camera!: PerspectiveCamera;
  private readonly modelView: Mat4 = mat4.create();
  private readonly world: Mat4 = mat4.create();
  private view: Float64Array = new Float64Array(3 * 256);
  private poly: Float64Array = new Float64Array(3 * 16);
  private clipped: Float64Array = new Float64Array(3 * 32);
  private screen: Float64Array = new Float64Array(2 * 32);
  private readonly seg: Float64Array = new Float64Array(6);
  /** Per corner of the current smooth face: lit color (rgb), quantized key, screen position. */
  private cornerColor: Float64Array = new Float64Array(3 * 16);
  private cornerKey: Int32Array = new Int32Array(16);
  private cornerScreen: Float64Array = new Float64Array(2 * 16);
  private readonly tri: Float64Array = new Float64Array(6);
  private readonly gradientLine: Float64Array = new Float64Array(4);
  /** Color key of the last smooth face that falls back to flat shading. */
  private smoothFlatKey: number = 0;
  private cloud: Float64Array = new Float64Array(4 * 256);
  private cloudIndex: Int32Array = new Int32Array(256);
  readonly lighting: Lighting = new Lighting();
  readonly shadows: ShadowProjector = new ShadowProjector();
  private background: RGB = { r: 0, g: 0, b: 0 };
  private backgroundCss: string = "";
  private readonly meshStyles: WeakMap<Material, MeshStyles> = new WeakMap();
  private readonly cloudStyles: WeakMap<object, CloudStyles> = new WeakMap();
  private readonly lineFogStyles: WeakMap<LineSet, CloudStyles> = new WeakMap();
  private readonly luts: Map<string, Int32Array> = new Map();
  private readonly litClouds: WeakMap<SphereCloud, LitCloud> = new WeakMap();
  private readonly sphereLight: SphereLight = {
    ambientR: 0,
    ambientG: 0,
    ambientB: 0,
    lightR: 0,
    lightG: 0,
    lightB: 0,
    lx: 0,
    ly: 0,
    lz: -1,
    phase: 0,
  };

  constructor(queue: RenderQueue = new RenderQueue()) {
    this.queue = queue;
  }

  emitScene(scene: Scene, camera: PerspectiveCamera, width: number, height: number): void {
    this.begin(scene, camera, width, height);
    for (const node of scene.nodes) {
      if (!node.visible) continue;
      switch (node.kind) {
        case "mesh":
          this.emitMesh(node, camera);
          break;
        case "spheres":
          this.emitSpheres(node, camera);
          break;
        case "points":
          this.emitPoints(node, camera);
          break;
        case "lines":
          this.emitLines(node, camera);
          break;
        case "custom":
          node.emit(this);
          break;
      }
    }
    this.shadows.emit(scene, this);
  }

  /** Resets the queue and prepares per-frame state (projection, lights in view space). */
  begin(scene: Scene, camera: PerspectiveCamera, width: number, height: number): void {
    this.queue.reset();
    this.culled = 0;
    this.camera = camera;
    camera.updateMatrices();
    updateProjection(this.proj, camera, width, height);
    if (scene.background !== this.backgroundCss) {
      this.backgroundCss = scene.background;
      this.background = parseColor(scene.background);
    }

    this.lighting.update(scene, camera.viewMatrix);
  }

  emitMesh(node: MeshNode, camera: PerspectiveCamera = this.camera): void {
    const local = node.transform.updateMatrix();
    const world = node.parentMatrix ? mat4.multiply(this.world, node.parentMatrix, local) : local;
    this.meshAt(node.mesh, node.material, world, camera, node.layer, node.sortMode);
  }

  drawMesh(mesh: Mesh, material: Material, world: Mat4, layer: number = Layer.World, sortMode: SortMode = "face"): void {
    this.meshAt(mesh, material, world, this.camera, layer, sortMode);
  }

  private meshAt(
    mesh: Mesh,
    mat: Material,
    world: Mat4,
    camera: PerspectiveCamera,
    layer: number,
    sortMode: SortMode,
  ): void {
    const q = this.queue;
    const p = this.proj;
    const near = p.near;
    const m = mat4.multiply(this.modelView, camera.viewMatrix, world);
    // Object sorting: every face at the depth of the origin (a convex mesh never overlaps itself)
    const objectDepth = sortMode === "object" ? m[14] : NaN;

    const vc = mesh.vertexCount;
    if (this.view.length < vc * 3) this.view = new Float64Array(vc * 6);
    const view = this.view;
    const pos = mesh.positions;
    for (let i = 0; i < vc * 3; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      view[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      view[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      view[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }

    const styles = this.meshStylesFor(mat);
    const faceCount = mesh.faceCount;
    const lighting = this.lighting;
    const lit = mat.shading !== "unlit";
    // Scenes and materials without any of the newer lighting features keep the original brightness model
    const simple = lighting.simple && mat.specular <= 0 && mat.emissive === null;
    const smooth = mat.shading === "smooth" && faceCount > 0 && !mat.wireframe;
    const corners = smooth ? mesh.computeCornerNormals() : null;

    if (!mat.wireframe && faceCount > 0) {
      const fi = mesh.faceIndices;
      const fs = mesh.faceStart;
      for (let f = 0; f < faceCount; f++) {
        const start = fs[f];
        const n = fs[f + 1] - start;
        if (n < 3) continue;
        this.ensurePolygonCapacity(n);
        const poly = this.poly;

        let cx = 0;
        let cy = 0;
        let cz = 0;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let k = 0; k < n; k++) {
          const idx = fi[start + k] * 3;
          const x = view[idx];
          const y = view[idx + 1];
          const z = view[idx + 2];
          poly[k * 3] = x;
          poly[k * 3 + 1] = y;
          poly[k * 3 + 2] = z;
          cx += x;
          cy += y;
          cz += z;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        cx /= n;
        cy /= n;
        cz /= n;
        if (maxZ < near) {
          this.culled++;
          continue;
        }

        // Newell normal in view space; the camera is at the origin
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let k = 0; k < n; k++) {
          const a = k * 3;
          const b = ((k + 1) % n) * 3;
          nx += (poly[a + 1] - poly[b + 1]) * (poly[a + 2] + poly[b + 2]);
          ny += (poly[a + 2] - poly[b + 2]) * (poly[a] + poly[b]);
          nz += (poly[a] - poly[b]) * (poly[a + 1] + poly[b + 1]);
        }
        const flipped = nx * cx + ny * cy + nz * cz >= 0;
        if (flipped) {
          if (mat.side === "front") {
            this.culled++;
            continue;
          }
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const depth = sortMode === "object" ? objectDepth : cz;
        let style: number;
        if (corners) {
          if (this.smoothFace(styles, mat, m, corners, start, n, flipped, minZ < near, layer, depth)) continue;
          style = this.fineStyle(styles, this.smoothFlatKey);
        } else if (simple || (!lit && !lighting.fog)) {
          let level = SHADE_LEVELS - 1;
          if (lit) {
            const len = Math.hypot(nx, ny, nz) || 1;
            level = Math.round(lighting.brightness(nx / len, ny / len, nz / len) * (SHADE_LEVELS - 1));
          }
          style = styles.faces[level];
        } else {
          const len = Math.hypot(nx, ny, nz) || 1;
          style = this.shadeFace(styles, mat, lit, nx / len, ny / len, nz / len, cx, cy, cz);
        }

        let src = poly;
        let count = n;
        if (minZ < near) {
          count = clipPolygonNear(near, poly, n, this.clipped);
          src = this.clipped;
          if (count < 3) {
            this.culled++;
            continue;
          }
        }
        const screen = this.screen;
        for (let k = 0; k < count; k++) {
          const z = src[k * 3 + 2];
          screen[k * 2] = p.cx + (p.sx * src[k * 3]) / z;
          screen[k * 2 + 1] = p.cy - (p.sy * src[k * 3 + 1]) / z;
        }
        q.pushPolygon(layer, style, depth, screen, count);
      }
    }

    if (mat.wireframe || faceCount === 0) {
      const e = mesh.edges;
      const seg = this.seg;
      for (let k = 0; k < e.length; k += 2) {
        const a = e[k] * 3;
        const b = e[k + 1] * 3;
        seg[0] = view[a];
        seg[1] = view[a + 1];
        seg[2] = view[a + 2];
        seg[3] = view[b];
        seg[4] = view[b + 1];
        seg[5] = view[b + 2];
        if (!clipSegmentNear(near, seg)) {
          this.culled++;
          continue;
        }
        const depth = (seg[2] + seg[5]) / 2;
        q.pushLine(
          layer,
          lighting.fog ? this.foggedLine(styles, depth) : styles.line,
          depth,
          p.cx + (p.sx * seg[0]) / seg[2],
          p.cy - (p.sy * seg[1]) / seg[2],
          p.cx + (p.sx * seg[3]) / seg[5],
          p.cy - (p.sy * seg[4]) / seg[5],
        );
      }
    }
  }

  emitSpheres(node: SphereCloud, camera: PerspectiveCamera): void {
    if (node.shading !== "flat") {
      this.emitLitSpheres(node, camera);
      return;
    }
    const src = node.source;
    const n = src.count;
    const pos = src.pos;
    const rad = src.radius;
    const v = camera.viewMatrix;
    const p = this.proj;
    const near = p.near;
    const minR = node.minPixelRadius;
    const only = node.group ?? -1;
    const groups = only >= 0 ? (src.group ?? null) : null;
    this.ensureCloudCapacity(n);
    const cloud = this.cloud;
    const index = this.cloudIndex;

    let k = 0;
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (groups !== null && groups[i] !== only) continue;
      const r = rad[i];
      if (!(r > 0)) continue;
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      if (vz - r <= near) {
        this.culled++;
        continue;
      }
      const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
      const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
      let sr = (p.sy * r) / vz;
      if (sr < minR) sr = minR;
      const px = p.cx + (p.sx * vx) / vz;
      const py = p.cy - (p.sy * vy) / vz;
      if (px + sr < 0 || px - sr > p.width || py + sr < 0 || py - sr > p.height) {
        this.culled++;
        continue;
      }
      cloud[k * 4] = px;
      cloud[k * 4 + 1] = py;
      cloud[k * 4 + 2] = sr;
      cloud[k * 4 + 3] = vz;
      index[k] = i;
      k++;
      if (vz < zmin) zmin = vz;
      if (vz > zmax) zmax = vz;
    }
    if (k === 0) return;

    const levels = Math.max(1, Math.floor(node.shadeLevels));
    const fog = this.lighting.fog;
    const ids = this.cloudStylesFor(node, node.palette, levels, node.depthCue);
    const scale = zmax > zmin ? (levels - 1) / (zmax - zmin) : 0;
    const pal = node.palette.length;
    const colorIndex = node.colorIndex;
    const q = this.queue;
    for (let j = 0; j < k; j++) {
      const z = cloud[j * 4 + 3];
      // With fog, spheres fade by their absolute depth; without, relative to the nearest and farthest
      const level = fog ? Math.round(this.lighting.fogFactor(z) * (levels - 1)) : Math.round((z - zmin) * scale);
      let c = 0;
      if (colorIndex) {
        c = colorIndex(index[j]) % pal;
        if (!(c >= 0)) c = 0;
      }
      q.pushCircle(node.layer, ids[c * levels + level], z, cloud[j * 4], cloud[j * 4 + 1], cloud[j * 4 + 2]);
    }
  }

  /**
   * Spheres colored by the scene lights. "lit": one quantized color per sphere (batched like flat
   * spheres). "sprite": spheres big enough on screen become a sprite: its key is the palette color, the
   * direction to the strongest light (quantized into AZIMUTHS x ELEVATIONS bins), that light's strength
   * and the uniform rest, each quantized to 5 bits per channel, so nearby spheres share images.
   */
  private emitLitSpheres(node: SphereCloud, camera: PerspectiveCamera): void {
    const src = node.source;
    const n = src.count;
    const pos = src.pos;
    const rad = src.radius;
    const v = camera.viewMatrix;
    const p = this.proj;
    const near = p.near;
    const minR = node.minPixelRadius;
    const only = node.group ?? -1;
    const groups = only >= 0 ? (src.group ?? null) : null;
    const sprites = node.shading === "sprite";
    const minSprite = node.spriteMinRadius;
    const lit = this.litCloudFor(node);
    const base = lit.base;
    const pal = node.palette.length;
    const colorIndex = node.colorIndex;
    const l = this.lighting;
    const s = this.sphereLight;
    const q = this.queue;
    const lut = this.plainLut();
    const fog = l.fog;

    for (let i = 0; i < n; i++) {
      if (groups !== null && groups[i] !== only) continue;
      const r = rad[i];
      if (!(r > 0)) continue;
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      if (vz - r <= near) {
        this.culled++;
        continue;
      }
      const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
      const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
      let sr = (p.sy * r) / vz;
      if (sr < minR) sr = minR;
      const px = p.cx + (p.sx * vx) / vz;
      const py = p.cy - (p.sy * vy) / vz;
      if (px + sr < 0 || px - sr > p.width || py + sr < 0 || py - sr > p.height) {
        this.culled++;
        continue;
      }
      let c = 0;
      if (colorIndex) {
        c = colorIndex(i) % pal;
        if (!(c >= 0)) c = 0;
      }
      l.sphere(vx, vy, vz, r, s);

      if (sprites && sr >= minSprite) {
        const lightKey = spriteLightKey(s.lightR, s.lightG, s.lightB);
        const key = (c * AZIMUTHS * ELEVATIONS + lightBin(s.lx, s.ly, s.lz)) * LIGHT_KEYS + lightKey;
        const ambientKey = (level15(s.ambientR) << 8) | (level15(s.ambientG) << 4) | level15(s.ambientB);
        let byAmbient = lit.sprites.get(key);
        if (!byAmbient) {
          byAmbient = new Map();
          lit.sprites.set(key, byAmbient);
        }
        let id = byAmbient.get(ambientKey);
        if (id === undefined) {
          id = this.makeSprite(lit, c, key, lightKey, ambientKey);
          byAmbient.set(ambientKey, id);
        }
        q.pushSprite(node.layer, id, vz, px, py, sr);
        continue;
      }

      // One color for the whole sphere: the uniform light plus the visible share of the strongest light
      const br = base[c * 3];
      const bg = base[c * 3 + 1];
      const bb = base[c * 3 + 2];
      let cr = br * (s.ambientR + s.lightR * s.phase);
      let cg = bg * (s.ambientG + s.lightG * s.phase);
      let cb = bb * (s.ambientB + s.lightB * s.phase);
      if (fog) {
        const f = l.fogFactor(vz);
        cr += (l.fogR - cr) * f;
        cg += (l.fogG - cg) * f;
        cb += (l.fogB - cb) * f;
      }
      const qk = quantize(cr, cg, cb);
      let style = lut[qk];
      if (style < 0) {
        style = q.styles.intern(quantizedCss(qk));
        lut[qk] = style;
      }
      q.pushCircle(node.layer, style, vz, px, py, sr);
    }
  }

  /** A new sprite from its quantized key: every sphere with the same key gets the same image. */
  private makeSprite(lit: LitCloud, color: number, key: number, lightKey: number, ambientKey: number): number {
    const table = this.queue.sprites;
    const bin = Math.floor(key / LIGHT_KEYS) % (AZIMUTHS * ELEVATIONS);
    const e = Math.floor(bin / AZIMUTHS);
    const a = bin % AZIMUTHS;
    const lz = -((e / (ELEVATIONS - 1)) * 2 - 1);
    const ring = Math.sqrt(Math.max(0, 1 - lz * lz));
    const phi = (a / AZIMUTHS) * 2 * Math.PI;
    // Strength back from its square-root level, times the hue
    const strength = ((lightKey & 15) / 15) ** 2 * SPRITE_LIGHT_MAX;
    const hue = lightKey >> 4;
    return table.add({
      baseR: lit.base[color * 3],
      baseG: lit.base[color * 3 + 1],
      baseB: lit.base[color * 3 + 2],
      ambientR: ((ambientKey >> 8) & 15) / 15,
      ambientG: ((ambientKey >> 4) & 15) / 15,
      ambientB: (ambientKey & 15) / 15,
      lightR: (((hue >> 8) & 15) / 15) * strength,
      lightG: (((hue >> 4) & 15) / 15) * strength,
      lightB: ((hue & 15) / 15) * strength,
      lx: ring * Math.cos(phi),
      ly: ring * Math.sin(phi),
      lz,
      specular: lit.specular,
      shininess: lit.shininess,
    });
  }

  private litCloudFor(node: SphereCloud): LitCloud {
    const table = this.queue.sprites;
    if (table.size > MAX_SPRITES) table.clear();
    let lit = this.litClouds.get(node);
    const palette = node.palette;
    let same =
      lit !== undefined &&
      lit.palette.length === palette.length &&
      lit.specular === node.specular &&
      lit.shininess === node.shininess;
    for (let k = 0; same && k < palette.length; k++) same = lit!.palette[k] === palette[k];
    if (!lit || !same) {
      const base = new Float64Array(palette.length * 3);
      palette.forEach((css, k) => {
        const c = colorOf(css);
        base[k * 3] = c.r / 255;
        base[k * 3 + 1] = c.g / 255;
        base[k * 3 + 2] = c.b / 255;
      });
      lit = { palette: [...palette], base, specular: node.specular, shininess: node.shininess, sprites: new Map(), generation: table.generation };
      this.litClouds.set(node, lit);
    }
    if (lit.generation !== table.generation) {
      lit.sprites.clear();
      lit.generation = table.generation;
    }
    return lit;
  }

  /** The color table of plain fills (no outline, opaque). */
  private plainLut(): Int32Array {
    const key = "null|1|1";
    let lut = this.luts.get(key);
    if (!lut) {
      lut = new Int32Array(32768).fill(-1);
      this.luts.set(key, lut);
    }
    return lut;
  }

  emitPoints(node: PointCloud, camera: PerspectiveCamera): void {
    const src = node.source;
    const n = src.count;
    const pos = src.pos;
    const v = camera.viewMatrix;
    const p = this.proj;
    const near = p.near;
    const size = node.size;
    const half = size / 2;
    const only = node.group ?? -1;
    const groups = only >= 0 ? (src.group ?? null) : null;
    this.ensureCloudCapacity(n);
    const cloud = this.cloud;

    let k = 0;
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (groups !== null && groups[i] !== only) continue;
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      if (!(vz > near)) {
        this.culled++;
        continue;
      }
      const px = p.cx + (p.sx * (v[0] * x + v[4] * y + v[8] * z + v[12])) / vz;
      const py = p.cy - (p.sy * (v[1] * x + v[5] * y + v[9] * z + v[13])) / vz;
      if (px + half < 0 || px - half > p.width || py + half < 0 || py - half > p.height) {
        this.culled++;
        continue;
      }
      cloud[k * 4] = px;
      cloud[k * 4 + 1] = py;
      cloud[k * 4 + 3] = vz;
      k++;
      if (vz < zmin) zmin = vz;
      if (vz > zmax) zmax = vz;
    }
    if (k === 0) return;

    const levels = Math.max(1, Math.floor(node.shadeLevels));
    const fog = this.lighting.fog;
    const ids = this.cloudStylesFor(node, [node.color], levels, node.depthCue);
    const scale = zmax > zmin ? (levels - 1) / (zmax - zmin) : 0;
    const q = this.queue;
    for (let j = 0; j < k; j++) {
      const z = cloud[j * 4 + 3];
      const level = fog ? Math.round(this.lighting.fogFactor(z) * (levels - 1)) : Math.round((z - zmin) * scale);
      q.pushPoint(node.layer, ids[level], z, cloud[j * 4], cloud[j * 4 + 1], size);
    }
  }

  emitLines(node: LineSet, camera: PerspectiveCamera): void {
    const v = camera.viewMatrix;
    const p = this.proj;
    const near = p.near;
    const seg = this.seg;
    const pts = node.positions;
    const style = this.queue.styles.intern(null, node.color, node.width, node.opacity);
    const fogIds = this.lighting.fog ? this.lineSetFog(node) : null;
    const count = Math.min(node.count, node.capacity);
    for (let s = 0; s < count; s++) {
      const o = s * 6;
      for (let e = 0; e < 6; e += 3) {
        const x = pts[o + e];
        const y = pts[o + e + 1];
        const z = pts[o + e + 2];
        seg[e] = v[0] * x + v[4] * y + v[8] * z + v[12];
        seg[e + 1] = v[1] * x + v[5] * y + v[9] * z + v[13];
        seg[e + 2] = v[2] * x + v[6] * y + v[10] * z + v[14];
      }
      if (!clipSegmentNear(near, seg)) {
        this.culled++;
        continue;
      }
      const depth = (seg[2] + seg[5]) / 2;
      this.queue.pushLine(
        node.layer,
        fogIds ? fogIds[Math.round(this.lighting.fogFactor(depth) * (FOG_LEVELS - 1))] : style,
        depth,
        p.cx + (p.sx * seg[0]) / seg[2],
        p.cy - (p.sy * seg[1]) / seg[2],
        p.cx + (p.sx * seg[3]) / seg[5],
        p.cy - (p.sy * seg[4]) / seg[5],
      );
    }
  }

  style(fill: string | null, stroke: string | null = null, lineWidth: number = 1, alpha: number = 1): number {
    return this.queue.styles.intern(fill, stroke, lineWidth, alpha);
  }

  polygon3D(layer: number, style: number, xyz: ArrayLike<number>, n: number): boolean {
    if (n < 3) return false;
    this.ensurePolygonCapacity(n);
    const v = this.camera.viewMatrix;
    const p = this.proj;
    const poly = this.poly;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let cz = 0;
    for (let k = 0; k < n; k++) {
      const x = xyz[k * 3];
      const y = xyz[k * 3 + 1];
      const z = xyz[k * 3 + 2];
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      poly[k * 3] = v[0] * x + v[4] * y + v[8] * z + v[12];
      poly[k * 3 + 1] = v[1] * x + v[5] * y + v[9] * z + v[13];
      poly[k * 3 + 2] = vz;
      cz += vz;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
    if (maxZ < p.near) {
      this.culled++;
      return false;
    }
    let src = poly;
    let count = n;
    if (minZ < p.near) {
      count = clipPolygonNear(p.near, poly, n, this.clipped);
      src = this.clipped;
      if (count < 3) {
        this.culled++;
        return false;
      }
    }
    const screen = this.screen;
    for (let k = 0; k < count; k++) {
      const z = src[k * 3 + 2];
      screen[k * 2] = p.cx + (p.sx * src[k * 3]) / z;
      screen[k * 2 + 1] = p.cy - (p.sy * src[k * 3 + 1]) / z;
    }
    this.queue.pushPolygon(layer, style, cz / n, screen, count);
    return true;
  }

  line3D(layer: number, style: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const v = this.camera.viewMatrix;
    const p = this.proj;
    const seg = this.seg;
    seg[0] = v[0] * ax + v[4] * ay + v[8] * az + v[12];
    seg[1] = v[1] * ax + v[5] * ay + v[9] * az + v[13];
    seg[2] = v[2] * ax + v[6] * ay + v[10] * az + v[14];
    seg[3] = v[0] * bx + v[4] * by + v[8] * bz + v[12];
    seg[4] = v[1] * bx + v[5] * by + v[9] * bz + v[13];
    seg[5] = v[2] * bx + v[6] * by + v[10] * bz + v[14];
    if (!clipSegmentNear(p.near, seg)) {
      this.culled++;
      return false;
    }
    this.queue.pushLine(
      layer,
      style,
      (seg[2] + seg[5]) / 2,
      p.cx + (p.sx * seg[0]) / seg[2],
      p.cy - (p.sy * seg[1]) / seg[2],
      p.cx + (p.sx * seg[3]) / seg[5],
      p.cy - (p.sy * seg[4]) / seg[5],
    );
    return true;
  }

  circle3D(layer: number, style: number, x: number, y: number, z: number, r: number): boolean {
    const v = this.camera.viewMatrix;
    const p = this.proj;
    const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    if (vz - r <= p.near) {
      this.culled++;
      return false;
    }
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
    const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
    this.queue.pushCircle(layer, style, vz, p.cx + (p.sx * vx) / vz, p.cy - (p.sy * vy) / vz, (p.sy * r) / vz);
    return true;
  }

  project(x: number, y: number, z: number, out: { x: number; y: number }): number {
    const v = this.camera.viewMatrix;
    const p = this.proj;
    const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    if (!(vz > p.near)) return -1;
    out.x = p.cx + (p.sx * (v[0] * x + v[4] * y + v[8] * z + v[12])) / vz;
    out.y = p.cy - (p.sy * (v[1] * x + v[5] * y + v[9] * z + v[13])) / vz;
    return vz;
  }

  brightness(nx: number, ny: number, nz: number): number {
    const v = this.camera.viewMatrix;
    return this.lighting.brightness(
      v[0] * nx + v[4] * ny + v[8] * nz,
      v[1] * nx + v[5] * ny + v[9] * nz,
      v[2] * nx + v[6] * ny + v[10] * nz,
    );
  }

  litStyle(material: Material, nx: number, ny: number, nz: number, x: number, y: number, z: number): number {
    const v = this.camera.viewMatrix;
    const styles = this.meshStylesFor(material);
    return this.shadeFace(
      styles,
      material,
      material.shading !== "unlit",
      v[0] * nx + v[4] * ny + v[8] * nz,
      v[1] * nx + v[5] * ny + v[9] * nz,
      v[2] * nx + v[6] * ny + v[10] * nz,
      v[0] * x + v[4] * y + v[8] * z + v[12],
      v[1] * x + v[5] * y + v[9] * z + v[13],
      v[2] * x + v[6] * y + v[10] * z + v[14],
    );
  }

  /** Full lighting model for a view-space unit normal and point: a style from the material's color table. */
  private shadeFace(
    styles: MeshStyles,
    mat: Material,
    lit: boolean,
    nx: number,
    ny: number,
    nz: number,
    px: number,
    py: number,
    pz: number,
  ): number {
    const l = this.lighting;
    let r: number;
    let g: number;
    let b: number;
    if (lit) {
      l.shade(nx, ny, nz, px, py, pz, styles.baseR, styles.baseG, styles.baseB, mat.specular, mat.shininess, styles.emR, styles.emG, styles.emB);
      r = l.r;
      g = l.g;
      b = l.b;
    } else {
      const f = l.fogFactor(pz);
      r = styles.baseR + (l.fogR - styles.baseR) * f;
      g = styles.baseG + (l.fogG - styles.baseG) * f;
      b = styles.baseB + (l.fogB - styles.baseB) * f;
    }
    return this.lutStyle(styles, quantize(r, g, b));
  }

  /**
   * Gouraud shading for one face: lights every corner with its smooth normal. Faces whose corners all
   * quantize to one color, or that cross the near plane, return false and are drawn flat (in that color,
   * or the average). The rest are fanned into triangles filled with linear gradients, which reproduce
   * the interpolated color exactly when the corner colors lie on a line in RGB (one light color over one
   * base color) and approximate it along the strongest color change otherwise.
   */
  private smoothFace(
    styles: MeshStyles,
    mat: Material,
    m: Mat4,
    corners: Float32Array,
    start: number,
    n: number,
    flipped: boolean,
    clipped: boolean,
    layer: number,
    depth: number,
  ): boolean {
    if (this.cornerKey.length < n) {
      this.cornerColor = new Float64Array(n * 6);
      this.cornerKey = new Int32Array(n * 2);
      this.cornerScreen = new Float64Array(n * 4);
    }
    const color = this.cornerColor;
    const keys = this.cornerKey;
    const poly = this.poly;
    const l = this.lighting;
    const sign = flipped ? -1 : 1;
    let uniform = true;
    let ar = 0;
    let ag = 0;
    let ab = 0;
    for (let k = 0; k < n; k++) {
      const c = (start + k) * 3;
      const x = corners[c];
      const y = corners[c + 1];
      const z = corners[c + 2];
      let vx = (m[0] * x + m[4] * y + m[8] * z) * sign;
      let vy = (m[1] * x + m[5] * y + m[9] * z) * sign;
      let vz = (m[2] * x + m[6] * y + m[10] * z) * sign;
      const len = Math.hypot(vx, vy, vz) || 1;
      vx /= len;
      vy /= len;
      vz /= len;
      l.shade(vx, vy, vz, poly[k * 3], poly[k * 3 + 1], poly[k * 3 + 2], styles.baseR, styles.baseG, styles.baseB, mat.specular, mat.shininess, styles.emR, styles.emG, styles.emB);
      color[k * 3] = l.r;
      color[k * 3 + 1] = l.g;
      color[k * 3 + 2] = l.b;
      ar += l.r;
      ag += l.g;
      ab += l.b;
      keys[k] = quantizeFine(l.r, l.g, l.b);
      if (keys[k] !== keys[0]) uniform = false;
    }
    if (uniform || clipped) {
      // Leave the face to the flat path, shaded with this color
      this.smoothFlatKey = uniform ? keys[0] : quantizeFine(ar / n, ag / n, ab / n);
      return false;
    }

    const p = this.proj;
    const screen = this.cornerScreen;
    for (let k = 0; k < n; k++) {
      const z = poly[k * 3 + 2];
      screen[k * 2] = p.cx + (p.sx * poly[k * 3]) / z;
      screen[k * 2 + 1] = p.cy - (p.sy * poly[k * 3 + 1]) / z;
    }
    const average = this.fineStyle(styles, quantizeFine(ar / n, ag / n, ab / n));
    for (let k = 1; k + 1 < n; k++) this.gradientTriangle(styles, average, layer, depth, 0, k, k + 1);
    return true;
  }

  /** One triangle of corners a, b, c of the current smooth face. */
  private gradientTriangle(styles: MeshStyles, style: number, layer: number, depth: number, a: number, b: number, c: number): void {
    const keys = this.cornerKey;
    const s = this.cornerScreen;
    const tri = this.tri;
    tri[0] = s[a * 2];
    tri[1] = s[a * 2 + 1];
    tri[2] = s[b * 2];
    tri[3] = s[b * 2 + 1];
    tri[4] = s[c * 2];
    tri[5] = s[c * 2 + 1];
    if (keys[a] === keys[b] && keys[a] === keys[c]) {
      this.queue.pushPolygon(layer, this.fineStyle(styles, keys[a]), depth, tri, 3);
      return;
    }

    // The gradient runs between the two most different corners; the third is placed along that axis
    const dab = this.colorDistance(a, b);
    const dac = this.colorDistance(a, c);
    const dbc = this.colorDistance(b, c);
    let from = a;
    let to = b;
    let best = dab;
    if (dac > best) {
      to = c;
      best = dac;
    }
    if (dbc > best) {
      from = b;
      to = c;
      best = dbc;
    }
    const line = this.gradientLine;
    const t0 = this.alongAxis(a, from, to, best);
    const t1 = this.alongAxis(b, from, to, best);
    const t2 = this.alongAxis(c, from, to, best);
    if (!triangleGradient(tri[0], tri[1], t0, tri[2], tri[3], t1, tri[4], tri[5], t2, line)) {
      this.queue.pushPolygon(layer, style, depth, tri, 3);
      return;
    }

    // Grow the triangle around its center to hide seams
    const mx = (tri[0] + tri[2] + tri[4]) / 3;
    const my = (tri[1] + tri[3] + tri[5]) / 3;
    for (let k = 0; k < 6; k += 2) {
      const ex = tri[k] - mx;
      const ey = tri[k + 1] - my;
      const len = Math.hypot(ex, ey);
      if (len > 0) {
        tri[k] += (ex / len) * SEAM;
        tri[k + 1] += (ey / len) * SEAM;
      }
    }
    this.queue.pushGradientPolygon(layer, style, depth, tri, 3, line[0], line[1], line[2], line[3], keys[from], keys[to]);
  }

  /** Style of a fine (6-bit) color key, from a lookup table shared by alike materials. */
  private fineStyle(styles: MeshStyles, key: number): number {
    let lut = styles.fineLut;
    if (!lut) {
      const shared = `fine|${styles.lutKey}`;
      lut = this.luts.get(shared) ?? null;
      if (!lut) {
        lut = new Int32Array(1 << 18).fill(-1);
        this.luts.set(shared, lut);
      }
      styles.fineLut = lut;
    }
    let id = lut[key];
    if (id < 0) {
      id = this.queue.styles.intern(fineCss(key), styles.edgeCss, styles.lineWidth, styles.opacity);
      lut[key] = id;
    }
    return id;
  }

  private colorDistance(u: number, v: number): number {
    const c = this.cornerColor;
    const dr = c[v * 3] - c[u * 3];
    const dg = c[v * 3 + 1] - c[u * 3 + 1];
    const db = c[v * 3 + 2] - c[u * 3 + 2];
    return dr * dr + dg * dg + db * db;
  }

  /** Position of corner k's color along the axis from corner `from` to `to` (0..1). */
  private alongAxis(k: number, from: number, to: number, length2: number): number {
    const c = this.cornerColor;
    const v =
      ((c[k * 3] - c[from * 3]) * (c[to * 3] - c[from * 3]) +
        (c[k * 3 + 1] - c[from * 3 + 1]) * (c[to * 3 + 1] - c[from * 3 + 1]) +
        (c[k * 3 + 2] - c[from * 3 + 2]) * (c[to * 3 + 2] - c[from * 3 + 2])) /
      length2;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  private lutStyle(styles: MeshStyles, key: number): number {
    let id = styles.lut[key];
    if (id < 0) {
      id = this.queue.styles.intern(quantizedCss(key), styles.edgeCss, styles.lineWidth, styles.opacity);
      styles.lut[key] = id;
    }
    return id;
  }

  /** Line style of a mesh's edges at a view depth, faded toward the fog color. */
  private foggedLine(styles: MeshStyles, depth: number): number {
    const l = this.lighting;
    if (!styles.lineFog || styles.lineFogCss !== l.fogCss) {
      styles.lineFog = this.fogRamp(styles.color, styles.lineWidth, styles.opacity);
      styles.lineFogCss = l.fogCss;
    }
    return styles.lineFog[Math.round(l.fogFactor(depth) * (FOG_LEVELS - 1))];
  }

  private lineSetFog(node: LineSet): Int32Array {
    const key = `${node.color}|${node.width}|${node.opacity}|${this.lighting.fogCss}`;
    const cached = this.lineFogStyles.get(node);
    if (cached && cached.key === key) return cached.ids;
    const ids = this.fogRamp(node.color, node.width, node.opacity);
    this.lineFogStyles.set(node, { key, ids });
    return ids;
  }

  /** Stroke styles from a color to the fog color in FOG_LEVELS steps. */
  private fogRamp(color: string, width: number, opacity: number): Int32Array {
    const base = parseColor(color);
    const l = this.lighting;
    const fog: RGB = { r: l.fogR * 255, g: l.fogG * 255, b: l.fogB * 255 };
    const ids = new Int32Array(FOG_LEVELS);
    for (let k = 0; k < FOG_LEVELS; k++) {
      ids[k] = this.queue.styles.intern(null, toCss(mix(base, fog, k / (FOG_LEVELS - 1))), width, opacity);
    }
    return ids;
  }

  private meshStylesFor(mat: Material): MeshStyles {
    const cached = this.meshStyles.get(mat);
    if (
      cached &&
      cached.color === mat.color &&
      cached.edgeColor === mat.edgeColor &&
      cached.lineWidth === mat.lineWidth &&
      cached.opacity === mat.opacity &&
      cached.edges === mat.edges &&
      cached.emissive === mat.emissive
    ) {
      return cached;
    }
    const table = this.queue.styles;
    const base = parseColor(mat.color);
    const edge = mat.edgeColor ?? toCss(shade(base, 0.55));
    const faces = new Int32Array(SHADE_LEVELS);
    for (let k = 0; k < SHADE_LEVELS; k++) {
      const fill = toCss(shade(base, k / (SHADE_LEVELS - 1)));
      faces[k] = table.intern(fill, mat.edges ? edge : null, mat.lineWidth, mat.opacity);
    }
    const edgeCss = mat.edges ? edge : null;
    const lutKey = `${edgeCss}|${mat.lineWidth}|${mat.opacity}`;
    let lut = this.luts.get(lutKey);
    if (!lut) {
      lut = new Int32Array(32768).fill(-1);
      this.luts.set(lutKey, lut);
    }
    const em = mat.emissive ? colorOf(mat.emissive) : null;
    const styles: MeshStyles = {
      color: mat.color,
      edgeColor: mat.edgeColor,
      lineWidth: mat.lineWidth,
      opacity: mat.opacity,
      edges: mat.edges,
      emissive: mat.emissive,
      faces,
      line: table.intern(null, mat.color, mat.lineWidth, mat.opacity),
      baseR: base.r / 255,
      baseG: base.g / 255,
      baseB: base.b / 255,
      emR: em ? em.r / 255 : 0,
      emG: em ? em.g / 255 : 0,
      emB: em ? em.b / 255 : 0,
      edgeCss,
      lut,
      fineLut: null,
      lutKey,
      lineFog: null,
      lineFogCss: "",
    };
    this.meshStyles.set(mat, styles);
    return styles;
  }

  /**
   * One fill style per (palette color, depth level), fading toward the background with depth by
   * `depthCue`, or all the way to the fog color when the scene has fog.
   */
  private cloudStylesFor(owner: object, palette: string[], levels: number, depthCue: number): Int32Array {
    const l = this.lighting;
    const key = l.fog
      ? `${palette.join("|")}#${levels}#fog#${l.fogCss}`
      : `${palette.join("|")}#${levels}#${depthCue}#${this.backgroundCss}`;
    const cached = this.cloudStyles.get(owner);
    if (cached && cached.key === key) return cached.ids;
    const target: RGB = l.fog ? { r: l.fogR * 255, g: l.fogG * 255, b: l.fogB * 255 } : this.background;
    const cue = l.fog ? 1 : depthCue;
    const ids = new Int32Array(palette.length * levels);
    for (let c = 0; c < palette.length; c++) {
      const base = parseColor(palette[c]);
      for (let k = 0; k < levels; k++) {
        const t = levels > 1 ? (k / (levels - 1)) * cue : 0;
        ids[c * levels + k] = this.queue.styles.intern(toCss(mix(base, target, t)));
      }
    }
    this.cloudStyles.set(owner, { key, ids });
    return ids;
  }

  private ensurePolygonCapacity(n: number): void {
    if (this.poly.length < n * 3) {
      this.poly = new Float64Array(n * 3);
      this.clipped = new Float64Array(n * 6);
      this.screen = new Float64Array(n * 4);
    }
  }

  private ensureCloudCapacity(n: number): void {
    if (this.cloudIndex.length < n) {
      const cap = Math.max(n, this.cloudIndex.length * 2);
      this.cloud = new Float64Array(cap * 4);
      this.cloudIndex = new Int32Array(cap);
    }
  }
}
