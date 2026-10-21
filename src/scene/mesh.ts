import type { Vec3 } from "../math/vec3.js";

/**
 * Polygon mesh stored in typed arrays. Faces can have any number of vertices (quads stay quads,
 * which suits Canvas 2D). Faces are wound so that cross(v1 - v0, v2 - v0) points outward.
 */
export class Mesh {
  /** xyz per vertex. */
  positions: Float32Array;
  /** Vertex indices of all faces, back to back. */
  faceIndices: Uint32Array;
  /** Face f uses faceIndices[faceStart[f] .. faceStart[f + 1]). */
  faceStart: Uint32Array;
  /** Vertex index pairs. */
  edges: Uint32Array;
  /** Unit normal (xyz) per face, in mesh space. */
  faceNormals: Float32Array;
  /**
   * Unit normal (xyz) per face corner, parallel to faceIndices: the smooth surface normal for Gouraud
   * shading. Corners only average the faces around their vertex that meet within the crease angle, so
   * hard edges (a cylinder's rim) stay sharp without duplicating vertices. Built by computeCornerNormals().
   */
  cornerNormals: Float32Array | null = null;
  /** Bumped by markDirty() when positions change. */
  version: number = 0;
  private cornerVersion: number = -1;
  private creaseCos: number = 0.5;
  private vertexFaceStart: Uint32Array | null = null;
  private vertexFaces: Uint32Array | null = null;

  constructor(positions: ArrayLike<number>, faces: ArrayLike<number>[] = [], edges?: ArrayLike<number>) {
    this.positions = positions instanceof Float32Array ? positions : Float32Array.from(positions);

    let total = 0;
    for (const f of faces) total += f.length;
    this.faceIndices = new Uint32Array(total);
    this.faceStart = new Uint32Array(faces.length + 1);
    let o = 0;
    for (let f = 0; f < faces.length; f++) {
      this.faceStart[f] = o;
      const face = faces[f];
      for (let k = 0; k < face.length; k++) this.faceIndices[o++] = face[k];
    }
    this.faceStart[faces.length] = o;

    this.faceNormals = new Float32Array(faces.length * 3);
    this.edges = edges ? Uint32Array.from(edges) : new Uint32Array(0);
    if (!edges) this.computeEdges();
    this.computeFaceNormals();
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get faceCount(): number {
    return this.faceStart.length - 1;
  }

  getVertex(i: number, out: Vec3): Vec3 {
    out.x = this.positions[i * 3];
    out.y = this.positions[i * 3 + 1];
    out.z = this.positions[i * 3 + 2];
    return out;
  }

  setVertex(i: number, x: number, y: number, z: number): void {
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
  }

  /** Newell's method: robust for quads and other polygons. */
  computeFaceNormals(): this {
    const p = this.positions;
    for (let f = 0; f < this.faceCount; f++) {
      const start = this.faceStart[f];
      const end = this.faceStart[f + 1];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let k = start; k < end; k++) {
        const a = this.faceIndices[k] * 3;
        const b = this.faceIndices[k + 1 < end ? k + 1 : start] * 3;
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      this.faceNormals[f * 3] = nx / len;
      this.faceNormals[f * 3 + 1] = ny / len;
      this.faceNormals[f * 3 + 2] = nz / len;
    }
    return this;
  }

  /** Unique edges of all faces. */
  computeEdges(): this {
    const seen = new Set<number>();
    const pairs: number[] = [];
    const n = this.vertexCount;
    for (let f = 0; f < this.faceCount; f++) {
      const start = this.faceStart[f];
      const end = this.faceStart[f + 1];
      for (let k = start; k < end; k++) {
        const a = this.faceIndices[k];
        const b = this.faceIndices[k + 1 < end ? k + 1 : start];
        const key = a < b ? a * n + b : b * n + a;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(a, b);
      }
    }
    this.edges = Uint32Array.from(pairs);
    return this;
  }

  /** Call after changing positions. */
  markDirty(): void {
    this.version++;
    this.computeFaceNormals();
  }

  /**
   * Smooth normals per face corner (see cornerNormals). Faces meeting at more than `creaseAngle`
   * (radians) keep a hard edge. Recomputed only when the mesh changed since the last call.
   */
  computeCornerNormals(creaseAngle: number = Math.PI / 3): Float32Array {
    const creaseCos = Math.cos(creaseAngle);
    if (this.cornerNormals && this.cornerVersion === this.version && this.creaseCos === creaseCos) {
      return this.cornerNormals;
    }
    this.creaseCos = creaseCos;
    this.cornerVersion = this.version;
    const fi = this.faceIndices;
    const fs = this.faceStart;
    const fn = this.faceNormals;
    if (!this.vertexFaces) this.buildVertexFaces();
    const vfStart = this.vertexFaceStart!;
    const vf = this.vertexFaces!;
    const out = this.cornerNormals ?? new Float32Array(fi.length * 3);
    this.cornerNormals = out;

    for (let f = 0; f < this.faceCount; f++) {
      const ax = fn[f * 3];
      const ay = fn[f * 3 + 1];
      const az = fn[f * 3 + 2];
      for (let k = fs[f]; k < fs[f + 1]; k++) {
        const v = fi[k];
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let a = vfStart[v]; a < vfStart[v + 1]; a++) {
          const g = vf[a];
          const bx = fn[g * 3];
          const by = fn[g * 3 + 1];
          const bz = fn[g * 3 + 2];
          if (ax * bx + ay * by + az * bz >= creaseCos) {
            nx += bx;
            ny += by;
            nz += bz;
          }
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        out[k * 3] = nx / len;
        out[k * 3 + 1] = ny / len;
        out[k * 3 + 2] = nz / len;
      }
    }
    return out;
  }

  /** Vertex -> faces adjacency (CSR), built once: the topology never changes, only positions. */
  private buildVertexFaces(): void {
    const n = this.vertexCount;
    const start = new Uint32Array(n + 1);
    const fi = this.faceIndices;
    for (let k = 0; k < fi.length; k++) start[fi[k] + 1]++;
    for (let v = 0; v < n; v++) start[v + 1] += start[v];
    const fill = start.slice(0, n);
    const faces = new Uint32Array(fi.length);
    for (let f = 0; f < this.faceCount; f++) {
      for (let k = this.faceStart[f]; k < this.faceStart[f + 1]; k++) faces[fill[fi[k]]++] = f;
    }
    this.vertexFaceStart = start;
    this.vertexFaces = faces;
  }

  /** Axis-aligned box centered at the origin. */
  static box(sx: number, sy: number = sx, sz: number = sx): Mesh {
    const x = sx / 2;
    const y = sy / 2;
    const z = sz / 2;
    // prettier-ignore
    const positions = [
      -x, -y, -z,   x, -y, -z,   x, y, -z,   -x, y, -z,
      -x, -y,  z,   x, -y,  z,   x, y,  z,   -x, y,  z,
    ];
    const faces = [
      [0, 3, 2, 1], // -z
      [4, 5, 6, 7], // +z
      [0, 4, 7, 3], // -x
      [1, 2, 6, 5], // +x
      [0, 1, 5, 4], // -y
      [3, 7, 6, 2], // +y
    ];
    return new Mesh(positions, faces);
  }

  /** Subdivided rectangle in the XZ plane, facing +y. Vertex (i, j) is at index j * (segW + 1) + i. */
  static plane(width: number, depth: number, segW: number = 1, segD: number = 1): Mesh {
    const positions: number[] = [];
    for (let j = 0; j <= segD; j++) {
      for (let i = 0; i <= segW; i++) {
        positions.push(-width / 2 + (width * i) / segW, 0, -depth / 2 + (depth * j) / segD);
      }
    }
    const faces: number[][] = [];
    const row = segW + 1;
    for (let j = 0; j < segD; j++) {
      for (let i = 0; i < segW; i++) {
        const a = j * row + i;
        faces.push([a, a + row, a + row + 1, a + 1]);
      }
    }
    return new Mesh(positions, faces);
  }

  /** Lines-only floor grid in the XZ plane. */
  static grid(size: number, divisions: number): Mesh {
    const positions: number[] = [];
    const edges: number[] = [];
    const h = size / 2;
    for (let k = 0; k <= divisions; k++) {
      const t = -h + (size * k) / divisions;
      const v = positions.length / 3;
      positions.push(t, 0, -h, t, 0, h, -h, 0, t, h, 0, t);
      edges.push(v, v + 1, v + 2, v + 3);
    }
    return new Mesh(positions, [], edges);
  }

  /** Latitude/longitude sphere centered at the origin. */
  static sphere(radius: number, widthSegments: number = 12, heightSegments: number = 8): Mesh {
    const positions: number[] = [0, radius, 0];
    for (let j = 1; j < heightSegments; j++) {
      const theta = (Math.PI * j) / heightSegments;
      for (let i = 0; i < widthSegments; i++) {
        const phi = (2 * Math.PI * i) / widthSegments;
        positions.push(
          radius * Math.sin(theta) * Math.cos(phi),
          radius * Math.cos(theta),
          radius * Math.sin(theta) * Math.sin(phi),
        );
      }
    }
    const bottom = positions.length / 3;
    positions.push(0, -radius, 0);

    const ring = (j: number, i: number): number => 1 + (j - 1) * widthSegments + (i % widthSegments);
    const faces: number[][] = [];
    for (let i = 0; i < widthSegments; i++) {
      faces.push([0, ring(1, i + 1), ring(1, i)]);
      for (let j = 1; j < heightSegments - 1; j++) {
        faces.push([ring(j, i), ring(j, i + 1), ring(j + 1, i + 1), ring(j + 1, i)]);
      }
      faces.push([bottom, ring(heightSegments - 1, i), ring(heightSegments - 1, i + 1)]);
    }

    // Make every face wind outward (cross(v1 - v0, v2 - v0) pointing away from the center)
    const mesh = new Mesh(positions, faces);
    const p = mesh.positions;
    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const idx of face) {
        cx += p[idx * 3];
        cy += p[idx * 3 + 1];
        cz += p[idx * 3 + 2];
      }
      const n = mesh.faceNormals;
      if (n[f * 3] * cx + n[f * 3 + 1] * cy + n[f * 3 + 2] * cz < 0) face.reverse();
    }
    return new Mesh(positions, faces);
  }

  /** Cylinder along y, centered at the origin, with flat caps (one polygon each). */
  static cylinder(radius: number, height: number, segments: number = 16): Mesh {
    const h = height / 2;
    return Mesh.lathe([radius, h, radius, -h], segments, false);
  }

  /**
   * Capsule along y, centered at the origin: a cylinder of length 2 * halfHeight capped by hemispheres,
   * the same shape as a physics capsule of that radius and half height.
   */
  static capsule(radius: number, halfHeight: number, segments: number = 16, rings: number = 4): Mesh {
    const profile: number[] = [];
    for (let j = 1; j <= rings; j++) {
      const a = (Math.PI / 2) * (j / rings);
      profile.push(radius * Math.sin(a), halfHeight + radius * Math.cos(a));
    }
    for (let j = 0; j < rings; j++) {
      const a = Math.PI / 2 + (Math.PI / 2) * (j / rings);
      profile.push(radius * Math.sin(a), -halfHeight + radius * Math.cos(a));
    }
    return Mesh.lathe(profile, segments, true, halfHeight + radius, -halfHeight - radius);
  }

  /** Sphere from a subdivided icosahedron: evenly sized triangles, good for smooth shading. */
  static icosphere(radius: number, subdivisions: number = 2): Mesh {
    const t = (1 + Math.sqrt(5)) / 2;
    // prettier-ignore
    const pts: number[] = [
      -1, t, 0,   1, t, 0,   -1, -t, 0,   1, -t, 0,
      0, -1, t,   0, 1, t,   0, -1, -t,   0, 1, -t,
      t, 0, -1,   t, 0, 1,   -t, 0, -1,   -t, 0, 1,
    ];
    // prettier-ignore
    let faces: number[][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    for (let s = 0; s < subdivisions; s++) {
      const mid = new Map<number, number>();
      const midpoint = (a: number, b: number): number => {
        const key = a < b ? a * 1e6 + b : b * 1e6 + a;
        let m = mid.get(key);
        if (m === undefined) {
          m = pts.length / 3;
          pts.push((pts[a * 3] + pts[b * 3]) / 2, (pts[a * 3 + 1] + pts[b * 3 + 1]) / 2, (pts[a * 3 + 2] + pts[b * 3 + 2]) / 2);
          mid.set(key, m);
        }
        return m;
      };
      const next: number[][] = [];
      for (const [a, b, c] of faces) {
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }
    for (let i = 0; i < pts.length; i += 3) {
      const len = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
      pts[i] = (pts[i] / len) * radius;
      pts[i + 1] = (pts[i + 1] / len) * radius;
      pts[i + 2] = (pts[i + 2] / len) * radius;
    }
    return new Mesh(pts, Mesh.outward(pts, faces));
  }

  /**
   * Surface of revolution around y. `profile` holds (ring radius, y) pairs from top to bottom. With
   * poles, the ends close in a point at topY / bottomY; without, each end is one flat polygon.
   */
  private static lathe(profile: number[], segments: number, poles: boolean, topY = 0, bottomY = 0): Mesh {
    const rings = profile.length / 2;
    const positions: number[] = [];
    const first = poles ? 1 : 0;
    if (poles) positions.push(0, topY, 0);
    for (let j = 0; j < rings; j++) {
      const r = profile[j * 2];
      const y = profile[j * 2 + 1];
      for (let i = 0; i < segments; i++) {
        const phi = (2 * Math.PI * i) / segments;
        positions.push(r * Math.cos(phi), y, r * Math.sin(phi));
      }
    }
    const bottom = positions.length / 3;
    if (poles) positions.push(0, bottomY, 0);

    const at = (j: number, i: number): number => first + j * segments + (i % segments);
    const faces: number[][] = [];
    for (let j = 0; j + 1 < rings; j++) {
      for (let i = 0; i < segments; i++) faces.push([at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i)]);
    }
    if (poles) {
      for (let i = 0; i < segments; i++) {
        faces.push([0, at(0, i + 1), at(0, i)]);
        faces.push([bottom, at(rings - 1, i), at(rings - 1, i + 1)]);
      }
    } else {
      const top: number[] = [];
      const base: number[] = [];
      for (let i = 0; i < segments; i++) {
        top.push(at(0, i));
        base.push(at(rings - 1, i));
      }
      faces.push(top, base);
    }
    return new Mesh(positions, Mesh.outward(positions, faces));
  }

  /** Winds every face of a shape that is convex around the origin so its normal points away from it. */
  private static outward(p: ArrayLike<number>, faces: number[][]): number[][] {
    for (const face of faces) {
      let nx = 0;
      let ny = 0;
      let nz = 0;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < face.length; k++) {
        const a = face[k] * 3;
        const b = face[(k + 1) % face.length] * 3;
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
        cx += p[a];
        cy += p[a + 1];
        cz += p[a + 2];
      }
      if (nx * cx + ny * cy + nz * cz < 0) face.reverse();
    }
    return faces;
  }

  /** Line segments through the points: consecutive pairs, or a connected strip. */
  static lines(points: Vec3[], strip: boolean = false): Mesh {
    const positions: number[] = [];
    for (const p of points) positions.push(p.x, p.y, p.z);
    const edges: number[] = [];
    if (strip) {
      for (let i = 0; i + 1 < points.length; i++) edges.push(i, i + 1);
    } else {
      for (let i = 0; i + 1 < points.length; i += 2) edges.push(i, i + 1);
    }
    return new Mesh(positions, [], edges);
  }
}
