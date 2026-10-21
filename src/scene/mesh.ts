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
  /** Bumped by markDirty() when positions change. */
  version: number = 0;

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
