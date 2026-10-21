import * as mat4 from "../../math/mat4.js";
import type { Mat4 } from "../../math/mat4.js";
import type { PerspectiveCamera } from "../../scene/camera.js";
import type { Material } from "../../scene/material.js";
import type { LineSet, MeshNode, PointCloud, SphereCloud } from "../../scene/nodes.js";
import type { Scene } from "../../scene/scene.js";
import { mix, parseColor, shade, toCss, type RGB } from "../color.js";
import { clipPolygonNear, clipSegmentNear } from "./clip.js";
import { createProjection, updateProjection, type ProjectionParams } from "./projection.js";
import { RenderQueue } from "./renderQueue.js";

/** Quantized brightness levels for flat shading (each level is one style, so this bounds the batch count). */
export const SHADE_LEVELS = 32;
const MAX_LIGHTS = 8;

interface MeshStyles {
  color: string;
  edgeColor: string | null;
  lineWidth: number;
  opacity: number;
  edges: boolean;
  faces: Int32Array;
  line: number;
}

interface CloudStyles {
  key: string;
  ids: Int32Array;
}

/**
 * The software pipeline in front of a 2D rasterizer. For every node it transforms to view space, culls
 * back faces and anything behind the camera, clips against the near plane, shades faces, projects with
 * x' = x / z, y' = y / z and submits the result to a RenderQueue.
 */
export class SoftwareEmitter {
  readonly queue: RenderQueue;
  readonly proj: ProjectionParams = createProjection();
  culled: number = 0;
  private readonly modelView: Mat4 = mat4.create();
  private view: Float64Array = new Float64Array(3 * 256);
  private poly: Float64Array = new Float64Array(3 * 16);
  private clipped: Float64Array = new Float64Array(3 * 32);
  private screen: Float64Array = new Float64Array(2 * 32);
  private readonly seg: Float64Array = new Float64Array(6);
  private cloud: Float64Array = new Float64Array(4 * 256);
  private cloudIndex: Int32Array = new Int32Array(256);
  private readonly lightDir: Float64Array = new Float64Array(3 * MAX_LIGHTS);
  private readonly lightIntensity: Float64Array = new Float64Array(MAX_LIGHTS);
  private lightCount: number = 0;
  private ambient: number = 0;
  private background: RGB = { r: 0, g: 0, b: 0 };
  private backgroundCss: string = "";
  private readonly meshStyles: WeakMap<Material, MeshStyles> = new WeakMap();
  private readonly cloudStyles: WeakMap<object, CloudStyles> = new WeakMap();

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
      }
    }
  }

  /** Resets the queue and prepares per-frame state (projection, lights in view space). */
  begin(scene: Scene, camera: PerspectiveCamera, width: number, height: number): void {
    this.queue.reset();
    this.culled = 0;
    camera.updateMatrices();
    updateProjection(this.proj, camera, width, height);
    if (scene.background !== this.backgroundCss) {
      this.backgroundCss = scene.background;
      this.background = parseColor(scene.background);
    }

    const v = camera.viewMatrix;
    this.ambient = scene.ambient.intensity;
    this.lightCount = Math.min(scene.lights.length, MAX_LIGHTS);
    for (let l = 0; l < this.lightCount; l++) {
      const light = scene.lights[l];
      const d = light.direction;
      const x = v[0] * d.x + v[4] * d.y + v[8] * d.z;
      const y = v[1] * d.x + v[5] * d.y + v[9] * d.z;
      const z = v[2] * d.x + v[6] * d.y + v[10] * d.z;
      const len = Math.hypot(x, y, z) || 1;
      this.lightDir[l * 3] = x / len;
      this.lightDir[l * 3 + 1] = y / len;
      this.lightDir[l * 3 + 2] = z / len;
      this.lightIntensity[l] = light.intensity;
    }
  }

  emitMesh(node: MeshNode, camera: PerspectiveCamera): void {
    const mesh = node.mesh;
    const mat = node.material;
    const q = this.queue;
    const p = this.proj;
    const near = p.near;
    const layer = node.layer;
    const m = mat4.multiply(this.modelView, camera.viewMatrix, node.transform.updateMatrix());

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
        if (nx * cx + ny * cy + nz * cz >= 0) {
          if (mat.side === "front") {
            this.culled++;
            continue;
          }
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }

        let level = SHADE_LEVELS - 1;
        if (mat.flatShading) {
          const len = Math.hypot(nx, ny, nz) || 1;
          level = Math.round(this.brightness(nx / len, ny / len, nz / len) * (SHADE_LEVELS - 1));
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
        q.pushPolygon(layer, styles.faces[level], cz, screen, count);
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
        q.pushLine(
          layer,
          styles.line,
          (seg[2] + seg[5]) / 2,
          p.cx + (p.sx * seg[0]) / seg[2],
          p.cy - (p.sy * seg[1]) / seg[2],
          p.cx + (p.sx * seg[3]) / seg[5],
          p.cy - (p.sy * seg[4]) / seg[5],
        );
      }
    }
  }

  emitSpheres(node: SphereCloud, camera: PerspectiveCamera): void {
    const src = node.source;
    const n = src.count;
    const pos = src.pos;
    const rad = src.radius;
    const v = camera.viewMatrix;
    const p = this.proj;
    const near = p.near;
    const minR = node.minPixelRadius;
    this.ensureCloudCapacity(n);
    const cloud = this.cloud;
    const index = this.cloudIndex;

    let k = 0;
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 0; i < n; i++) {
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
    const ids = this.cloudStylesFor(node, node.palette, levels, node.depthCue);
    const scale = zmax > zmin ? (levels - 1) / (zmax - zmin) : 0;
    const pal = node.palette.length;
    const colorIndex = node.colorIndex;
    const q = this.queue;
    for (let j = 0; j < k; j++) {
      const z = cloud[j * 4 + 3];
      const level = Math.round((z - zmin) * scale);
      let c = 0;
      if (colorIndex) {
        c = colorIndex(index[j]) % pal;
        if (!(c >= 0)) c = 0;
      }
      q.pushCircle(node.layer, ids[c * levels + level], z, cloud[j * 4], cloud[j * 4 + 1], cloud[j * 4 + 2]);
    }
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
    this.ensureCloudCapacity(n);
    const cloud = this.cloud;

    let k = 0;
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let i = 0; i < n; i++) {
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
    const ids = this.cloudStylesFor(node, [node.color], levels, node.depthCue);
    const scale = zmax > zmin ? (levels - 1) / (zmax - zmin) : 0;
    const q = this.queue;
    for (let j = 0; j < k; j++) {
      const z = cloud[j * 4 + 3];
      q.pushPoint(node.layer, ids[Math.round((z - zmin) * scale)], z, cloud[j * 4], cloud[j * 4 + 1], size);
    }
  }

  emitLines(node: LineSet, camera: PerspectiveCamera): void {
    const v = camera.viewMatrix;
    const p = this.proj;
    const near = p.near;
    const seg = this.seg;
    const pts = node.positions;
    const style = this.queue.styles.intern(null, node.color, node.width, node.opacity);
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
      this.queue.pushLine(
        node.layer,
        style,
        (seg[2] + seg[5]) / 2,
        p.cx + (p.sx * seg[0]) / seg[2],
        p.cy - (p.sy * seg[1]) / seg[2],
        p.cx + (p.sx * seg[3]) / seg[5],
        p.cy - (p.sy * seg[4]) / seg[5],
      );
    }
  }

  /** Lambert brightness for a unit view-space normal. */
  private brightness(nx: number, ny: number, nz: number): number {
    let sum = this.ambient;
    const d = this.lightDir;
    for (let l = 0; l < this.lightCount; l++) {
      const facing = -(nx * d[l * 3] + ny * d[l * 3 + 1] + nz * d[l * 3 + 2]);
      if (facing > 0) sum += facing * this.lightIntensity[l];
    }
    return sum < 0 ? 0 : sum > 1 ? 1 : sum;
  }

  private meshStylesFor(mat: Material): MeshStyles {
    const cached = this.meshStyles.get(mat);
    if (
      cached &&
      cached.color === mat.color &&
      cached.edgeColor === mat.edgeColor &&
      cached.lineWidth === mat.lineWidth &&
      cached.opacity === mat.opacity &&
      cached.edges === mat.edges
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
    const styles: MeshStyles = {
      color: mat.color,
      edgeColor: mat.edgeColor,
      lineWidth: mat.lineWidth,
      opacity: mat.opacity,
      edges: mat.edges,
      faces,
      line: table.intern(null, mat.color, mat.lineWidth, mat.opacity),
    };
    this.meshStyles.set(mat, styles);
    return styles;
  }

  /** One fill style per (palette color, depth level), fading toward the background with depth. */
  private cloudStylesFor(owner: object, palette: string[], levels: number, depthCue: number): Int32Array {
    const key = `${palette.join("|")}#${levels}#${depthCue}#${this.backgroundCss}`;
    const cached = this.cloudStyles.get(owner);
    if (cached && cached.key === key) return cached.ids;
    const ids = new Int32Array(palette.length * levels);
    for (let c = 0; c < palette.length; c++) {
      const base = parseColor(palette[c]);
      for (let l = 0; l < levels; l++) {
        const t = levels > 1 ? (l / (levels - 1)) * depthCue : 0;
        ids[c * levels + l] = this.queue.styles.intern(toCss(mix(base, this.background, t)));
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
