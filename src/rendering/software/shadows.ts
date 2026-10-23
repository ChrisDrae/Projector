import * as mat4 from "../../math/mat4.js";
import type { Mat4 } from "../../math/mat4.js";
import type { Light } from "../../scene/light.js";
import type { Mesh } from "../../scene/mesh.js";
import { Layer, type MeshNode, type SphereCloud } from "../../scene/nodes.js";
import type { Scene } from "../../scene/scene.js";
import type { EmitContext } from "./emit.js";

/**
 * Planar projected shadows. A receiver is the local y = 0 plane of a mesh node with receiveShadow (what
 * Mesh.plane and Mesh.grid lie in, e.g. a Ground), bounded by the mesh's extent. For every light with
 * castShadow, the light-facing faces of shadow-casting meshes and the outlines of shadow-casting spheres
 * are projected onto it along the light and clipped to its bounds. All of a receiver's shadows go into one
 * path in the shadow layer: with the nonzero fill rule overlapping shadows merge instead of darkening
 * each other, and the whole set is a single draw call.
 *
 * What this can't do: shadows on anything but such planes (no self-shadowing, none on curved surfaces).
 */
export class ShadowProjector {
  private readonly receivers: MeshNode[] = [];
  private readonly meshes: MeshNode[] = [];
  private readonly clouds: SphereCloud[] = [];
  private readonly model: Mat4 = mat4.create();
  // The receiver plane: origin, unit normal and in-plane axes, with bounds along the axes
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private nx = 0;
  private ny = 1;
  private nz = 0;
  private ux = 1;
  private uy = 0;
  private uz = 0;
  private wx = 0;
  private wy = 0;
  private wz = 1;
  private minU = 0;
  private maxU = 0;
  private minW = 0;
  private maxW = 0;
  // The light: directional (toward the light, unit) or a point
  private point = false;
  private lx = 0;
  private ly = 1;
  private lz = 0;
  private world: Float64Array = new Float64Array(3 * 64);
  private uw: Float64Array = new Float64Array(2 * 32);
  private uwTmp: Float64Array = new Float64Array(2 * 32);
  private out: Float64Array = new Float64Array(3 * 32);

  /** Projects every caster onto every receiver for each shadow-casting light. */
  emit(scene: Scene, ctx: EmitContext): void {
    const receivers = this.receivers;
    const meshes = this.meshes;
    const clouds = this.clouds;
    receivers.length = 0;
    meshes.length = 0;
    clouds.length = 0;
    for (const node of scene.nodes) {
      if (!node.visible) continue;
      if (node.kind === "mesh") {
        if (node.receiveShadow) receivers.push(node);
        if (node.castShadow && !node.material.wireframe && node.mesh.faceCount > 0) meshes.push(node);
      } else if (node.kind === "spheres" && node.castShadow) {
        clouds.push(node);
      }
    }
    if (receivers.length === 0 || (meshes.length === 0 && clouds.length === 0)) return;

    const shade = scene.shadow;
    const style = ctx.style(shade.color, null, 1, shade.opacity);
    for (const light of scene.lights) {
      if (!this.setLight(light)) continue;
      for (const receiver of receivers) {
        if (!this.setPlane(receiver, ctx)) continue;
        for (const node of meshes) if (node !== receiver) this.meshShadow(node, style, ctx);
        for (const cloud of clouds) this.cloudShadow(cloud, style, ctx);
      }
    }
  }

  private setLight(light: Light): boolean {
    if (light.kind === "hemisphere" || !light.castShadow) return false;
    if (light.kind === "directional") {
      const d = light.direction;
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      this.point = false;
      this.lx = -d.x / len;
      this.ly = -d.y / len;
      this.lz = -d.z / len;
    } else {
      this.point = true;
      this.lx = light.position.x;
      this.ly = light.position.y;
      this.lz = light.position.z;
    }
    return true;
  }

  /** The receiver's plane and bounds; false when the light or the camera is below it. */
  private setPlane(node: MeshNode, ctx: EmitContext): boolean {
    const m = worldMatrix(node, this.model);
    this.ox = m[12];
    this.oy = m[13];
    this.oz = m[14];
    const sx = Math.hypot(m[0], m[1], m[2]) || 1;
    const sy = Math.hypot(m[4], m[5], m[6]) || 1;
    const sz = Math.hypot(m[8], m[9], m[10]) || 1;
    this.ux = m[0] / sx;
    this.uy = m[1] / sx;
    this.uz = m[2] / sx;
    this.nx = m[4] / sy;
    this.ny = m[5] / sy;
    this.nz = m[6] / sy;
    this.wx = m[8] / sz;
    this.wy = m[9] / sz;
    this.wz = m[10] / sz;
    const b = bounds(node.mesh);
    this.minU = b.minU * sx;
    this.maxU = b.maxU * sx;
    this.minW = b.minW * sz;
    this.maxW = b.maxW * sz;

    const cam = ctx.camera.position;
    if (this.height(cam.x, cam.y, cam.z) <= 0) return false;
    if (this.point) return this.height(this.lx, this.ly, this.lz) > 0;
    return this.nx * this.lx + this.ny * this.ly + this.nz * this.lz > 1e-3;
  }

  private height(x: number, y: number, z: number): number {
    return this.nx * (x - this.ox) + this.ny * (y - this.oy) + this.nz * (z - this.oz);
  }

  /**
   * Projects a world point onto the plane along the light, into plane coordinates (u, w) at uw[k].
   * Returns false for points the light can't project (at or above a point light's height).
   */
  private project(x: number, y: number, z: number, k: number): boolean {
    const h = this.height(x, y, z);
    let px: number;
    let py: number;
    let pz: number;
    if (this.point) {
      const hl = this.height(this.lx, this.ly, this.lz);
      if (h >= hl - 1e-6) return false;
      const t = hl / (hl - h);
      px = this.lx + (x - this.lx) * t;
      py = this.ly + (y - this.ly) * t;
      pz = this.lz + (z - this.lz) * t;
    } else {
      const s = h / (this.nx * this.lx + this.ny * this.ly + this.nz * this.lz);
      px = x - this.lx * s;
      py = y - this.ly * s;
      pz = z - this.lz * s;
    }
    const dx = px - this.ox;
    const dy = py - this.oy;
    const dz = pz - this.oz;
    this.uw[k * 2] = this.ux * dx + this.uy * dy + this.uz * dz;
    this.uw[k * 2 + 1] = this.wx * dx + this.wy * dy + this.wz * dz;
    return true;
  }

  private meshShadow(node: MeshNode, style: number, ctx: EmitContext): void {
    const mesh = node.mesh;
    const m = worldMatrix(node, this.model);
    const vc = mesh.vertexCount;
    if (this.world.length < vc * 3) this.world = new Float64Array(vc * 6);
    const w = this.world;
    const pos = mesh.positions;
    for (let i = 0; i < vc * 3; i += 3) {
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      w[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      w[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      w[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const fi = mesh.faceIndices;
    const fs = mesh.faceStart;
    const fn = mesh.faceNormals;
    const twoSided = node.material.side === "double";
    for (let f = 0; f < mesh.faceCount; f++) {
      const start = fs[f];
      const n = fs[f + 1] - start;
      this.ensure(n);
      // Only faces lit by the light: their outline covers the whole shadow of a closed mesh
      if (!twoSided) {
        const a = fi[start] * 3;
        const fx = m[0] * fn[f * 3] + m[4] * fn[f * 3 + 1] + m[8] * fn[f * 3 + 2];
        const fy = m[1] * fn[f * 3] + m[5] * fn[f * 3 + 1] + m[9] * fn[f * 3 + 2];
        const fz = m[2] * fn[f * 3] + m[6] * fn[f * 3 + 1] + m[10] * fn[f * 3 + 2];
        const tx = this.point ? this.lx - w[a] : this.lx;
        const ty = this.point ? this.ly - w[a + 1] : this.ly;
        const tz = this.point ? this.lz - w[a + 2] : this.lz;
        if (fx * tx + fy * ty + fz * tz <= 0) continue;
      }
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        const v = fi[start + k] * 3;
        ok = this.project(w[v], w[v + 1], w[v + 2], k);
      }
      if (ok) this.emitShadowPolygon(n, style, ctx);
    }
  }

  private cloudShadow(cloud: SphereCloud, style: number, ctx: EmitContext): void {
    const src = cloud.source;
    const pos = src.pos;
    const rad = src.radius;
    const only = cloud.group ?? -1;
    const groups = only >= 0 ? (src.group ?? null) : null;
    const v = ctx.camera.viewMatrix;
    const p = ctx.proj;
    const ndl = this.nx * this.lx + this.ny * this.ly + this.nz * this.lz;
    for (let i = 0; i < src.count; i++) {
      if (groups !== null && groups[i] !== only) continue;
      const r = rad[i];
      if (!(r > 0)) continue;
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const h = this.height(x, y, z);
      if (h < -r) continue;

      // Direction toward the light (unit) and the shadow's magnification (point lights spread it)
      let tx = this.lx;
      let ty = this.ly;
      let tz = this.lz;
      let scale = 1;
      let cosine = ndl;
      if (this.point) {
        tx -= x;
        ty -= y;
        tz -= z;
        const len = Math.hypot(tx, ty, tz) || 1;
        tx /= len;
        ty /= len;
        tz /= len;
        const hl = this.height(this.lx, this.ly, this.lz);
        if (h >= hl) continue;
        scale = hl / (hl - h);
        cosine = this.nx * tx + this.ny * ty + this.nz * tz;
      }
      if (cosine <= 1e-3) continue;
      if (!this.project(x, y, z, 0)) continue;
      const cu = this.uw[0];
      const cw = this.uw[1];

      // Projected size on screen decides how round the ellipse needs to be
      const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
      if (vz <= p.near) continue;
      const screenR = (p.sy * r * scale) / vz;
      if (screenR < 0.5) continue;
      const sides = screenR < 3 ? 6 : screenR < 8 ? 8 : screenR < 24 ? 12 : 16;
      this.ensure(sides);

      // The light's direction in the plane is the ellipse's long axis, stretched by 1 / cos(angle)
      const lu = this.ux * tx + this.uy * ty + this.uz * tz;
      const lw = this.wx * tx + this.wy * ty + this.wz * tz;
      const ll = Math.hypot(lu, lw);
      const eu = ll > 1e-6 ? lu / ll : 1;
      const ew = ll > 1e-6 ? lw / ll : 0;
      const major = (r * scale) / cosine;
      const minor = r * scale;
      for (let k = 0; k < sides; k++) {
        const a = (2 * Math.PI * k) / sides;
        const c = Math.cos(a) * major;
        const s = Math.sin(a) * minor;
        this.uw[k * 2] = cu + eu * c - ew * s;
        this.uw[k * 2 + 1] = cw + ew * c + eu * s;
      }
      this.emitShadowPolygon(sides, style, ctx);
    }
  }

  /** Clips the polygon in uw to the receiver's bounds and draws it in the shadow layer. */
  private emitShadowPolygon(n: number, style: number, ctx: EmitContext): void {
    let src = this.uw;
    let dst = this.uwTmp;
    let count = n;
    // Sutherland-Hodgman against the four sides of the bounds
    for (let side = 0; side < 4 && count >= 3; side++) {
      const axis = side & 1;
      const limit = side === 0 ? this.minU : side === 1 ? this.minW : side === 2 ? this.maxU : this.maxW;
      const keepAbove = side < 2;
      let k = 0;
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const a = src[i * 2 + axis] - limit;
        const b = src[j * 2 + axis] - limit;
        const ina = keepAbove ? a >= 0 : a <= 0;
        const inb = keepAbove ? b >= 0 : b <= 0;
        if (ina) {
          dst[k * 2] = src[i * 2];
          dst[k * 2 + 1] = src[i * 2 + 1];
          k++;
        }
        if (ina !== inb) {
          const t = a / (a - b);
          dst[k * 2] = src[i * 2] + (src[j * 2] - src[i * 2]) * t;
          dst[k * 2 + 1] = src[i * 2 + 1] + (src[j * 2 + 1] - src[i * 2 + 1]) * t;
          k++;
        }
      }
      count = k;
      const t = src;
      src = dst;
      dst = t;
    }
    if (count < 3) return;
    const out = this.out;
    // A hair above the plane, so the shadow never fights with the receiver's own lines
    const lift = 1e-4;
    for (let k = 0; k < count; k++) {
      const u = src[k * 2];
      const w = src[k * 2 + 1];
      out[k * 3] = this.ox + this.ux * u + this.wx * w + this.nx * lift;
      out[k * 3 + 1] = this.oy + this.uy * u + this.wy * w + this.ny * lift;
      out[k * 3 + 2] = this.oz + this.uz * u + this.wz * w + this.nz * lift;
    }
    ctx.polygon3D(Layer.Shadow, style, out, count);
  }

  private ensure(n: number): void {
    // Clipping a convex polygon against four sides adds at most four vertices
    const cap = n + 8;
    if (this.uw.length < cap * 2) {
      this.uw = new Float64Array(cap * 4);
      this.uwTmp = new Float64Array(cap * 4);
      this.out = new Float64Array(cap * 6);
    }
  }
}

function worldMatrix(node: MeshNode, out: Mat4): Mat4 {
  const local = node.transform.updateMatrix();
  return node.parentMatrix ? mat4.multiply(out, node.parentMatrix, local) : mat4.copy(out, local);
}

interface Extent {
  version: number;
  minU: number;
  maxU: number;
  minW: number;
  maxW: number;
}

const extents: WeakMap<Mesh, Extent> = new WeakMap();

/** The mesh's local x/z extent (cached per mesh version). */
function bounds(mesh: Mesh): Extent {
  let e = extents.get(mesh);
  if (!e || e.version !== mesh.version) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minW = Infinity;
    let maxW = -Infinity;
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minU) minU = p[i];
      if (p[i] > maxU) maxU = p[i];
      if (p[i + 2] < minW) minW = p[i + 2];
      if (p[i + 2] > maxW) maxW = p[i + 2];
    }
    e = { version: mesh.version, minU, maxU, minW, maxW };
    extents.set(mesh, e);
  }
  return e;
}
