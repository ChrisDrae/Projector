// Near-plane clipping in view space, before the perspective divide. Without it, geometry that
// crosses behind the camera divides by z <= 0 and turns into garbage on screen.

/**
 * Clips a polygon (xyz triples) against z >= near (Sutherland-Hodgman). Writes the result to `out`
 * (which needs room for 2n vertices) and returns the new vertex count (0 if fully behind).
 */
export function clipPolygonNear(near: number, src: ArrayLike<number>, n: number, out: Float64Array): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = i * 3;
    const b = ((i + 1) % n) * 3;
    const ax = src[a];
    const ay = src[a + 1];
    const az = src[a + 2];
    const bz = src[b + 2];
    const aIn = az >= near;
    if (aIn) {
      out[m * 3] = ax;
      out[m * 3 + 1] = ay;
      out[m * 3 + 2] = az;
      m++;
    }
    if (aIn !== bz >= near) {
      const t = (near - az) / (bz - az);
      out[m * 3] = ax + (src[b] - ax) * t;
      out[m * 3 + 1] = ay + (src[b + 1] - ay) * t;
      out[m * 3 + 2] = near;
      m++;
    }
  }
  return m;
}

/** Clips the segment s = [x0, y0, z0, x1, y1, z1] in place. Returns false if it is entirely behind. */
export function clipSegmentNear(near: number, s: Float64Array): boolean {
  const z0 = s[2];
  const z1 = s[5];
  if (z0 < near && z1 < near) return false;
  if (z0 < near) {
    const t = (near - z0) / (z1 - z0);
    s[0] += (s[3] - s[0]) * t;
    s[1] += (s[4] - s[1]) * t;
    s[2] = near;
  } else if (z1 < near) {
    const t = (near - z1) / (z0 - z1);
    s[3] += (s[0] - s[3]) * t;
    s[4] += (s[1] - s[4]) * t;
    s[5] = near;
  }
  return true;
}
