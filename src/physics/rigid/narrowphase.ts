/**
 * Contact generation between rigid shapes. Every routine writes a Manifold: up to four contact points
 * sharing one unit normal that points from the first shape toward the second, each with a separation
 * (negative when the shapes overlap). Contacts are reported up to `margin` apart (speculative contacts:
 * the solver lets them close but not pass, which stops fast bodies from tunnelling).
 *
 * Boxes are given by center, rotation (3x3 row-major: column k is the box's k-th axis) and half extents.
 * Capsules by the two end points of their segment and their radius.
 */

export const MAX_POINTS = 4;

export class Manifold {
  count: number = 0;
  nx: number = 0;
  ny: number = 1;
  nz: number = 0;
  /** Contact points (world), xyz each. */
  readonly points: Float64Array = new Float64Array(3 * 8);
  readonly separation: Float64Array = new Float64Array(8);

  reset(): void {
    this.count = 0;
  }

  setNormal(x: number, y: number, z: number): void {
    this.nx = x;
    this.ny = y;
    this.nz = z;
  }

  add(x: number, y: number, z: number, separation: number): void {
    if (this.count >= 8) return;
    const k = this.count++;
    this.points[k * 3] = x;
    this.points[k * 3 + 1] = y;
    this.points[k * 3 + 2] = z;
    this.separation[k] = separation;
  }

  /** Swaps the roles of the two shapes. */
  flip(): void {
    this.nx = -this.nx;
    this.ny = -this.ny;
    this.nz = -this.nz;
  }

  /** Keeps at most four points: the deepest, then the ones spanning the largest area. */
  reduce(): void {
    if (this.count <= MAX_POINTS) return;
    const p = this.points;
    const s = this.separation;
    const n = this.count;
    const keep = [0, -1, -1, -1];
    for (let k = 1; k < n; k++) if (s[k] < s[keep[0]]) keep[0] = k;
    const d2 = (a: number, b: number): number =>
      (p[a * 3] - p[b * 3]) ** 2 + (p[a * 3 + 1] - p[b * 3 + 1]) ** 2 + (p[a * 3 + 2] - p[b * 3 + 2]) ** 2;
    let best = -1;
    for (let k = 0; k < n; k++) {
      const d = d2(k, keep[0]);
      if (d > best) {
        best = d;
        keep[1] = k;
      }
    }
    // Signed area (along the normal) of the triangle with the first two points picks the 3rd and 4th
    const area = (k: number): number => {
      const a = keep[0] * 3;
      const b = keep[1] * 3;
      const c = k * 3;
      const ux = p[b] - p[a];
      const uy = p[b + 1] - p[a + 1];
      const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a];
      const vy = p[c + 1] - p[a + 1];
      const vz = p[c + 2] - p[a + 2];
      return (uy * vz - uz * vy) * this.nx + (uz * vx - ux * vz) * this.ny + (ux * vy - uy * vx) * this.nz;
    };
    let most = 0;
    let least = 0;
    for (let k = 0; k < n; k++) {
      if (k === keep[0] || k === keep[1]) continue;
      const a = area(k);
      if (a > most) {
        most = a;
        keep[2] = k;
      }
      if (a < least) {
        least = a;
        keep[3] = k;
      }
    }
    const kept = keep.filter((k) => k >= 0);
    const xyz = kept.map((k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2], s[k]]);
    this.count = 0;
    for (const [x, y, z, sep] of xyz) this.add(x, y, z, sep);
  }
}

// Scratch space shared by the routines (single-threaded, never reentrant)
const seg = new Float64Array(6);
const tmp = new Float64Array(3);
const quadA = new Float64Array(3 * 16);
const quadB = new Float64Array(3 * 16);

/** Two spheres. */
export function sphereSphere(
  ax: number,
  ay: number,
  az: number,
  ra: number,
  bx: number,
  by: number,
  bz: number,
  rb: number,
  margin: number,
  out: Manifold,
): void {
  out.reset();
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const sep = d - ra - rb;
  if (sep > margin) return;
  if (d > 1e-12) out.setNormal(dx / d, dy / d, dz / d);
  else out.setNormal(0, 1, 0);
  const k = ra + sep / 2;
  out.add(ax + out.nx * k, ay + out.ny * k, az + out.nz * k, sep);
}

/** Closest point of a box to a point, in world space, into tmp; returns whether the point was inside. */
function closestOnBox(px: number, py: number, pz: number, c: ArrayLike<number>, co: number, r: ArrayLike<number>, ro: number, h: ArrayLike<number>, ho: number): boolean {
  const dx = px - c[co];
  const dy = py - c[co + 1];
  const dz = pz - c[co + 2];
  let inside = true;
  let qx = c[co];
  let qy = c[co + 1];
  let qz = c[co + 2];
  for (let k = 0; k < 3; k++) {
    const ax = r[ro + k];
    const ay = r[ro + 3 + k];
    const az = r[ro + 6 + k];
    let t = dx * ax + dy * ay + dz * az;
    const e = h[ho + k];
    if (t > e) {
      t = e;
      inside = false;
    } else if (t < -e) {
      t = -e;
      inside = false;
    }
    qx += ax * t;
    qy += ay * t;
    qz += az * t;
  }
  tmp[0] = qx;
  tmp[1] = qy;
  tmp[2] = qz;
  return inside;
}

/** Sphere (A) against box (B). Adds to `out` without resetting it; the normal must agree if points exist. */
function sphereBoxAdd(
  sx: number,
  sy: number,
  sz: number,
  sr: number,
  c: ArrayLike<number>,
  co: number,
  r: ArrayLike<number>,
  ro: number,
  h: ArrayLike<number>,
  ho: number,
  margin: number,
  out: Manifold,
  setNormal: boolean,
): boolean {
  const inside = closestOnBox(sx, sy, sz, c, co, r, ro, h, ho);
  if (!inside) {
    const dx = tmp[0] - sx;
    const dy = tmp[1] - sy;
    const dz = tmp[2] - sz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const sep = d - sr;
    if (sep > margin) return false;
    if (setNormal) {
      if (d > 1e-12) out.setNormal(dx / d, dy / d, dz / d);
      else out.setNormal(0, -1, 0);
    }
    out.add(tmp[0], tmp[1], tmp[2], sep);
    return true;
  }
  // Center inside the box: push out through the nearest face
  const dx = sx - c[co];
  const dy = sy - c[co + 1];
  const dz = sz - c[co + 2];
  let best = Infinity;
  let axis = 0;
  let sign = 1;
  for (let k = 0; k < 3; k++) {
    const t = dx * r[ro + k] + dy * r[ro + 3 + k] + dz * r[ro + 6 + k];
    const gap = h[ho + k] - Math.abs(t);
    if (gap < best) {
      best = gap;
      axis = k;
      sign = t >= 0 ? 1 : -1;
    }
  }
  // Normal from the sphere into the box: opposite to the face's outward normal
  if (setNormal) out.setNormal(-sign * r[ro + axis], -sign * r[ro + 3 + axis], -sign * r[ro + 6 + axis]);
  out.add(sx, sy, sz, -best - sr);
  return true;
}

/** Sphere (A) against box (B). */
export function sphereBox(
  sx: number,
  sy: number,
  sz: number,
  sr: number,
  c: ArrayLike<number>,
  co: number,
  r: ArrayLike<number>,
  ro: number,
  h: ArrayLike<number>,
  ho: number,
  margin: number,
  out: Manifold,
): void {
  out.reset();
  sphereBoxAdd(sx, sy, sz, sr, c, co, r, ro, h, ho, margin, out, true);
}

/** Parameter in [0, 1] of the point of segment (a, b) closest to p. */
function closestT(ax: number, ay: number, az: number, bx: number, by: number, bz: number, px: number, py: number, pz: number): number {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const l2 = ux * ux + uy * uy + uz * uz;
  if (l2 < 1e-18) return 0;
  const t = ((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Capsule segment (p, q) with radius rc (A) against a sphere (B). */
export function capsuleSphere(capsule: ArrayLike<number>, rc: number, sx: number, sy: number, sz: number, sr: number, margin: number, out: Manifold): void {
  const t = closestT(capsule[0], capsule[1], capsule[2], capsule[3], capsule[4], capsule[5], sx, sy, sz);
  sphereSphere(
    capsule[0] + (capsule[3] - capsule[0]) * t,
    capsule[1] + (capsule[4] - capsule[1]) * t,
    capsule[2] + (capsule[5] - capsule[2]) * t,
    rc,
    sx,
    sy,
    sz,
    sr,
    margin,
    out,
  );
}

/** Closest points between segments p1-q1 and p2-q2 (Ericson); writes s, t to seg[0], seg[1]. */
function closestSegments(
  p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number,
): void {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number;
  let t: number;
  if (a <= 1e-18 && e <= 1e-18) {
    s = 0;
    t = 0;
  } else if (a <= 1e-18) {
    s = 0;
    t = Math.min(Math.max(f / e, 0), 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-18) {
      t = 0;
      s = Math.min(Math.max(-c / a, 0), 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-18 ? Math.min(Math.max((b * f - c * e) / denom, 0), 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(Math.max(-c / a, 0), 1);
      } else if (t > 1) {
        t = 1;
        s = Math.min(Math.max((b - c) / a, 0), 1);
      }
    }
  }
  seg[0] = s;
  seg[1] = t;
}

/** Two capsules (A, B), each as segment end points (6 numbers) and radius. Parallel capsules get two points. */
export function capsuleCapsule(a: ArrayLike<number>, ra: number, b: ArrayLike<number>, rb: number, margin: number, out: Manifold): void {
  out.reset();
  closestSegments(a[0], a[1], a[2], a[3], a[4], a[5], b[0], b[1], b[2], b[3], b[4], b[5]);
  const s = seg[0];
  const t = seg[1];
  const pax = a[0] + (a[3] - a[0]) * s;
  const pay = a[1] + (a[4] - a[1]) * s;
  const paz = a[2] + (a[5] - a[2]) * s;
  const pbx = b[0] + (b[3] - b[0]) * t;
  const pby = b[1] + (b[4] - b[1]) * t;
  const pbz = b[2] + (b[5] - b[2]) * t;
  sphereSphere(pax, pay, paz, ra, pbx, pby, pbz, rb, margin, out);
  if (out.count === 0) return;

  // Nearly parallel: a single point would let them roll over each other; use the overlap's ends
  const ux = a[3] - a[0], uy = a[4] - a[1], uz = a[5] - a[2];
  const vx = b[3] - b[0], vy = b[4] - b[1], vz = b[5] - b[2];
  const lu = Math.hypot(ux, uy, uz);
  const lv = Math.hypot(vx, vy, vz);
  if (lu < 1e-9 || lv < 1e-9) return;
  const cos = Math.abs(ux * vx + uy * vy + uz * vz) / (lu * lv);
  if (cos < 0.995) return;
  const nx = out.nx, ny = out.ny, nz = out.nz;
  out.reset();
  out.setNormal(nx, ny, nz);
  for (let e = 0; e < 2; e++) {
    // The ends of the overlap: ends of B that lie along A, and ends of A strictly inside B
    const qx = b[e * 3], qy = b[e * 3 + 1], qz = b[e * 3 + 2];
    const ta = unclampedT(a, qx, qy, qz);
    if (ta >= 0 && ta <= 1) addSpherePair(a[0] + ux * ta, a[1] + uy * ta, a[2] + uz * ta, ra, qx, qy, qz, rb, margin, out);
    const px = a[e * 3], py = a[e * 3 + 1], pz = a[e * 3 + 2];
    const tb = unclampedT(b, px, py, pz);
    if (tb > 0 && tb < 1) addSpherePair(px, py, pz, ra, b[0] + vx * tb, b[1] + vy * tb, b[2] + vz * tb, rb, margin, out);
  }
  if (out.count === 0) sphereSphere(pax, pay, paz, ra, pbx, pby, pbz, rb, margin, out);
  out.reduce();
}

/** Parameter of the projection of p onto the line through segment s (6 numbers), not clamped. */
function unclampedT(s: ArrayLike<number>, px: number, py: number, pz: number): number {
  const ux = s[3] - s[0];
  const uy = s[4] - s[1];
  const uz = s[5] - s[2];
  const l2 = ux * ux + uy * uy + uz * uz;
  return l2 < 1e-18 ? 0 : ((px - s[0]) * ux + (py - s[1]) * uy + (pz - s[2]) * uz) / l2;
}

/** Adds the contact of two spheres along the manifold's normal (when close enough). */
function addSpherePair(ax: number, ay: number, az: number, ra: number, bx: number, by: number, bz: number, rb: number, margin: number, out: Manifold): void {
  const d = (bx - ax) * out.nx + (by - ay) * out.ny + (bz - az) * out.nz;
  const sep = d - ra - rb;
  if (sep > margin) return;
  const k = ra + sep / 2;
  out.add(ax + out.nx * k, ay + out.ny * k, az + out.nz * k, sep);
}

/** Capsule (A) against box (B): its ends, and the segment point nearest the box when that's in between. */
export function capsuleBox(
  capsule: ArrayLike<number>,
  rc: number,
  c: ArrayLike<number>,
  co: number,
  r: ArrayLike<number>,
  ro: number,
  h: ArrayLike<number>,
  ho: number,
  margin: number,
  out: Manifold,
): void {
  out.reset();
  // The point of the segment nearest the box, by alternating projections (converges for convex shapes)
  let t = 0.5;
  for (let it = 0; it < 6; it++) {
    const x = capsule[0] + (capsule[3] - capsule[0]) * t;
    const y = capsule[1] + (capsule[4] - capsule[1]) * t;
    const z = capsule[2] + (capsule[5] - capsule[2]) * t;
    closestOnBox(x, y, z, c, co, r, ro, h, ho);
    t = closestT(capsule[0], capsule[1], capsule[2], capsule[3], capsule[4], capsule[5], tmp[0], tmp[1], tmp[2]);
  }
  const mx = capsule[0] + (capsule[3] - capsule[0]) * t;
  const my = capsule[1] + (capsule[4] - capsule[1]) * t;
  const mz = capsule[2] + (capsule[5] - capsule[2]) * t;
  if (!sphereBoxAdd(mx, my, mz, rc, c, co, r, ro, h, ho, margin, out, true)) return;
  // Lying along a face: the ends hold it level
  if (t > 0.02) sphereBoxEnd(capsule[0], capsule[1], capsule[2], rc, c, co, r, ro, h, ho, margin, out);
  if (t < 0.98) sphereBoxEnd(capsule[3], capsule[4], capsule[5], rc, c, co, r, ro, h, ho, margin, out);
}

/** A capsule end as an extra point, measured along the manifold's normal. */
function sphereBoxEnd(
  x: number, y: number, z: number, rc: number,
  c: ArrayLike<number>, co: number, r: ArrayLike<number>, ro: number, h: ArrayLike<number>, ho: number,
  margin: number, out: Manifold,
): void {
  const inside = closestOnBox(x, y, z, c, co, r, ro, h, ho);
  if (inside) return;
  const dx = tmp[0] - x;
  const dy = tmp[1] - y;
  const dz = tmp[2] - z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Only points that touch the same face (their direction agrees with the normal)
  if (d < 1e-12 || (dx * out.nx + dy * out.ny + dz * out.nz) / d < 0.95) return;
  const sep = d - rc;
  if (sep > margin) return;
  out.add(tmp[0], tmp[1], tmp[2], sep);
}

/**
 * A convex point set against a plane with unit normal n (pointing into the free side) and offset:
 * bodies stay where dot(n, p) >= offset. Points are body vertices (or sphere centers with radius r).
 * The manifold's normal points from the body into the plane (-n).
 */
export function pointsPlane(points: ArrayLike<number>, count: number, r: number, nx: number, ny: number, nz: number, offset: number, margin: number, out: Manifold): void {
  out.reset();
  out.setNormal(-nx, -ny, -nz);
  for (let k = 0; k < count; k++) {
    const x = points[k * 3];
    const y = points[k * 3 + 1];
    const z = points[k * 3 + 2];
    const sep = nx * x + ny * y + nz * z - offset - r;
    if (sep > margin) continue;
    // On the surface of the body, halfway into the plane
    out.add(x - nx * (r + sep / 2), y - ny * (r + sep / 2), z - nz * (r + sep / 2), sep);
  }
  out.reduce();
}

/** The eight corners of a box into `out` (24 numbers). */
export function boxCorners(c: ArrayLike<number>, co: number, r: ArrayLike<number>, ro: number, h: ArrayLike<number>, ho: number, out: Float64Array): void {
  let k = 0;
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const lx = sx * h[ho];
        const ly = sy * h[ho + 1];
        const lz = sz * h[ho + 2];
        out[k++] = c[co] + r[ro] * lx + r[ro + 1] * ly + r[ro + 2] * lz;
        out[k++] = c[co + 1] + r[ro + 3] * lx + r[ro + 4] * ly + r[ro + 5] * lz;
        out[k++] = c[co + 2] + r[ro + 6] * lx + r[ro + 7] * ly + r[ro + 8] * lz;
      }
    }
  }
}

const rel = new Float64Array(9);
const absRel = new Float64Array(9);
const tA = new Float64Array(3);
const ea3 = new Float64Array(3);
const eb3 = new Float64Array(3);
const CORNER_U = [1, -1, -1, 1];
const CORNER_V = [1, 1, -1, -1];

/**
 * Two boxes (A, B) by the separating axis test over their 15 axes. A face axis gives a face contact:
 * the incident face of the other box is clipped against the reference face, for up to four points. An
 * edge axis gives the closest points of the two edges. Face axes are preferred when nearly as good, which
 * keeps stacks from flickering between contact types.
 */
export function boxBox(
  ca: ArrayLike<number>, cao: number, ra: ArrayLike<number>, rao: number, ha: ArrayLike<number>, hao: number,
  cb: ArrayLike<number>, cbo: number, rb: ArrayLike<number>, rbo: number, hb: ArrayLike<number>, hbo: number,
  margin: number, out: Manifold,
): void {
  out.reset();
  const tx = cb[cbo] - ca[cao];
  const ty = cb[cbo + 1] - ca[cao + 1];
  const tz = cb[cbo + 2] - ca[cao + 2];
  // rel[i][j] = A_i . B_j
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const v = ra[rao + i] * rb[rbo + j] + ra[rao + 3 + i] * rb[rbo + 3 + j] + ra[rao + 6 + i] * rb[rbo + 6 + j];
      rel[i * 3 + j] = v;
      absRel[i * 3 + j] = Math.abs(v) + 1e-9;
    }
  }
  const t = tA;
  for (let i = 0; i < 3; i++) t[i] = tx * ra[rao + i] + ty * ra[rao + 3 + i] + tz * ra[rao + 6 + i];
  const a = ea3;
  const b = eb3;
  for (let k = 0; k < 3; k++) {
    a[k] = ha[hao + k];
    b[k] = hb[hbo + k];
  }

  let faceSep = -Infinity;
  let faceAxis = -1; // 0-2: A's faces, 3-5: B's
  for (let i = 0; i < 3; i++) {
    const rbSum = b[0] * absRel[i * 3] + b[1] * absRel[i * 3 + 1] + b[2] * absRel[i * 3 + 2];
    const s = Math.abs(t[i]) - (a[i] + rbSum);
    if (s > margin) return;
    if (s > faceSep) {
      faceSep = s;
      faceAxis = i;
    }
  }
  for (let j = 0; j < 3; j++) {
    const raSum = a[0] * absRel[j] + a[1] * absRel[3 + j] + a[2] * absRel[6 + j];
    const tb = tx * rb[rbo + j] + ty * rb[rbo + 3 + j] + tz * rb[rbo + 6 + j];
    const s = Math.abs(tb) - (raSum + b[j]);
    if (s > margin) return;
    // B's faces only when clearly better than A's
    if (s > faceSep * 0.95 + 1e-3) {
      faceSep = s;
      faceAxis = 3 + j;
    }
  }

  let edgeSep = -Infinity;
  let edgeI = -1;
  let edgeJ = -1;
  let enx = 0;
  let eny = 0;
  let enz = 0;
  for (let i = 0; i < 3; i++) {
    const i1 = (i + 1) % 3;
    const i2 = (i + 2) % 3;
    for (let j = 0; j < 3; j++) {
      const j1 = (j + 1) % 3;
      const j2 = (j + 2) % 3;
      const len = Math.sqrt(Math.max(0, 1 - rel[i * 3 + j] * rel[i * 3 + j]));
      if (len < 1e-5) continue;
      const raSum = a[i1] * absRel[i2 * 3 + j] + a[i2] * absRel[i1 * 3 + j];
      const rbSum = b[j1] * absRel[i * 3 + j2] + b[j2] * absRel[i * 3 + j1];
      const tl = Math.abs(t[i2] * rel[i1 * 3 + j] - t[i1] * rel[i2 * 3 + j]);
      const s = (tl - (raSum + rbSum)) / len;
      if (s > margin) return;
      if (s > edgeSep) {
        edgeSep = s;
        edgeI = i;
        edgeJ = j;
        // Axis A_i x B_j in world space
        const aix = ra[rao + i], aiy = ra[rao + 3 + i], aiz = ra[rao + 6 + i];
        const bjx = rb[rbo + j], bjy = rb[rbo + 3 + j], bjz = rb[rbo + 6 + j];
        enx = (aiy * bjz - aiz * bjy) / len;
        eny = (aiz * bjx - aix * bjz) / len;
        enz = (aix * bjy - aiy * bjx) / len;
      }
    }
  }

  if (edgeI >= 0 && edgeSep > faceSep * 0.95 + 0.005) {
    // Edge-edge: orient the axis from A to B, find the two edges and their closest points
    if (enx * tx + eny * ty + enz * tz < 0) {
      enx = -enx;
      eny = -eny;
      enz = -enz;
    }
    out.setNormal(enx, eny, enz);
    let pax = ca[cao], pay = ca[cao + 1], paz = ca[cao + 2];
    let pbx = cb[cbo], pby = cb[cbo + 1], pbz = cb[cbo + 2];
    for (let k = 0; k < 3; k++) {
      if (k !== edgeI) {
        const ax = ra[rao + k], ay = ra[rao + 3 + k], az = ra[rao + 6 + k];
        const sgn = ax * enx + ay * eny + az * enz > 0 ? 1 : -1;
        pax += ax * sgn * a[k];
        pay += ay * sgn * a[k];
        paz += az * sgn * a[k];
      }
      if (k !== edgeJ) {
        const bx = rb[rbo + k], by = rb[rbo + 3 + k], bz = rb[rbo + 6 + k];
        const sgn = bx * enx + by * eny + bz * enz > 0 ? -1 : 1;
        pbx += bx * sgn * b[k];
        pby += by * sgn * b[k];
        pbz += bz * sgn * b[k];
      }
    }
    const aix = ra[rao + edgeI], aiy = ra[rao + 3 + edgeI], aiz = ra[rao + 6 + edgeI];
    const bjx = rb[rbo + edgeJ], bjy = rb[rbo + 3 + edgeJ], bjz = rb[rbo + 6 + edgeJ];
    const ea = a[edgeI];
    const eb = b[edgeJ];
    closestSegments(
      pax - aix * ea, pay - aiy * ea, paz - aiz * ea, pax + aix * ea, pay + aiy * ea, paz + aiz * ea,
      pbx - bjx * eb, pby - bjy * eb, pbz - bjz * eb, pbx + bjx * eb, pby + bjy * eb, pbz + bjz * eb,
    );
    const qax = pax + aix * ea * (2 * seg[0] - 1);
    const qay = pay + aiy * ea * (2 * seg[0] - 1);
    const qaz = paz + aiz * ea * (2 * seg[0] - 1);
    const qbx = pbx + bjx * eb * (2 * seg[1] - 1);
    const qby = pby + bjy * eb * (2 * seg[1] - 1);
    const qbz = pbz + bjz * eb * (2 * seg[1] - 1);
    out.add((qax + qbx) / 2, (qay + qby) / 2, (qaz + qbz) / 2, edgeSep);
    return;
  }

  // Face contact: reference box R (owner of the axis), incident box I
  const refIsA = faceAxis < 3;
  const axis = refIsA ? faceAxis : faceAxis - 3;
  const cR = refIsA ? ca : cb;
  const cRo = refIsA ? cao : cbo;
  const rR = refIsA ? ra : rb;
  const rRo = refIsA ? rao : rbo;
  const hR = refIsA ? a : b;
  const cI = refIsA ? cb : ca;
  const cIo = refIsA ? cbo : cao;
  const rI = refIsA ? rb : ra;
  const rIo = refIsA ? rbo : rao;
  const hI = refIsA ? b : a;
  // Reference normal, pointing from R toward I
  let nx = rR[rRo + axis];
  let ny = rR[rRo + 3 + axis];
  let nz = rR[rRo + 6 + axis];
  const dirX = refIsA ? tx : -tx;
  const dirY = refIsA ? ty : -ty;
  const dirZ = refIsA ? tz : -tz;
  if (nx * dirX + ny * dirY + nz * dirZ < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  // The incident face: the one of I facing most against the reference normal
  let inc = 0;
  let incDot = 0;
  for (let k = 0; k < 3; k++) {
    const d = rI[rIo + k] * nx + rI[rIo + 3 + k] * ny + rI[rIo + 6 + k] * nz;
    if (Math.abs(d) > Math.abs(incDot)) {
      incDot = d;
      inc = k;
    }
  }
  const incSign = incDot > 0 ? -1 : 1;
  const u = (inc + 1) % 3;
  const v = (inc + 2) % 3;
  const fcx = cI[cIo] + rI[rIo + inc] * incSign * hI[inc];
  const fcy = cI[cIo + 1] + rI[rIo + 3 + inc] * incSign * hI[inc];
  const fcz = cI[cIo + 2] + rI[rIo + 6 + inc] * incSign * hI[inc];
  for (let k = 0; k < 4; k++) {
    const su = CORNER_U[k] * hI[u];
    const sv = CORNER_V[k] * hI[v];
    quadA[k * 3] = fcx + rI[rIo + u] * su + rI[rIo + v] * sv;
    quadA[k * 3 + 1] = fcy + rI[rIo + 3 + u] * su + rI[rIo + 3 + v] * sv;
    quadA[k * 3 + 2] = fcz + rI[rIo + 6 + u] * su + rI[rIo + 6 + v] * sv;
  }
  // Clip against the four sides of the reference face
  const rfx = cR[cRo] + nx * hR[axis];
  const rfy = cR[cRo + 1] + ny * hR[axis];
  const rfz = cR[cRo + 2] + nz * hR[axis];
  let src = quadA;
  let dst = quadB;
  let count = 4;
  for (let side = 0; side < 4 && count > 0; side++) {
    const k = side < 2 ? (axis + 1) % 3 : (axis + 2) % 3;
    const sgn = side % 2 === 0 ? 1 : -1;
    const px = rR[rRo + k] * sgn;
    const py = rR[rRo + 3 + k] * sgn;
    const pz = rR[rRo + 6 + k] * sgn;
    const limit = hR[k];
    count = clipPlane(src, count, px, py, pz, px * rfx + py * rfy + pz * rfz + limit, dst);
    const swap = src;
    src = dst;
    dst = swap;
  }
  const flip = !refIsA;
  // Normal from A to B
  out.setNormal(flip ? -nx : nx, flip ? -ny : ny, flip ? -nz : nz);
  for (let k = 0; k < count; k++) {
    const x = src[k * 3];
    const y = src[k * 3 + 1];
    const z = src[k * 3 + 2];
    const sep = (x - rfx) * nx + (y - rfy) * ny + (z - rfz) * nz;
    if (sep > margin) continue;
    out.add(x - nx * (sep / 2), y - ny * (sep / 2), z - nz * (sep / 2), sep);
  }
  out.reduce();
}

/** Keeps the part of a polygon where dot(n, p) <= d. */
function clipPlane(src: Float64Array, n: number, nx: number, ny: number, nz: number, d: number, dst: Float64Array): number {
  let k = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const da = nx * src[i * 3] + ny * src[i * 3 + 1] + nz * src[i * 3 + 2] - d;
    const db = nx * src[j * 3] + ny * src[j * 3 + 1] + nz * src[j * 3 + 2] - d;
    if (da <= 0) {
      dst[k * 3] = src[i * 3];
      dst[k * 3 + 1] = src[i * 3 + 1];
      dst[k * 3 + 2] = src[i * 3 + 2];
      k++;
    }
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      dst[k * 3] = src[i * 3] + (src[j * 3] - src[i * 3]) * t;
      dst[k * 3 + 1] = src[i * 3 + 1] + (src[j * 3 + 1] - src[i * 3 + 1]) * t;
      dst[k * 3 + 2] = src[i * 3 + 2] + (src[j * 3 + 2] - src[i * 3 + 2]) * t;
      k++;
    }
  }
  return k;
}
