/**
 * The linear gradient that reproduces a value t interpolated linearly over a screen triangle: t0, t1, t2
 * at (x0, y0), (x1, y1), (x2, y2). Writes into `out` the points where t = 0 and t = 1 along the gradient
 * direction (out[0..1] and out[2..3]); a canvas linear gradient between them, with stops 0 and 1, then
 * has value t exactly at every point of the triangle. Returns false when t doesn't change across the
 * triangle (or it has no area), and a flat fill is right.
 */
export function triangleGradient(
  x0: number,
  y0: number,
  t0: number,
  x1: number,
  y1: number,
  t1: number,
  x2: number,
  y2: number,
  t2: number,
  out: Float64Array,
): boolean {
  const dx1 = x1 - x0;
  const dy1 = y1 - y0;
  const dx2 = x2 - x0;
  const dy2 = y2 - y0;
  const det = dx1 * dy2 - dx2 * dy1;
  if (det === 0) return false;
  const dt1 = t1 - t0;
  const dt2 = t2 - t0;
  // Screen-space gradient of t: the plane through the three (x, y, t) points
  const gx = (dt1 * dy2 - dt2 * dy1) / det;
  const gy = (dx1 * dt2 - dx2 * dt1) / det;
  const g2 = gx * gx + gy * gy;
  if (!(g2 > 1e-12)) return false;
  out[0] = x0 - (gx * t0) / g2;
  out[1] = y0 - (gy * t0) / g2;
  out[2] = out[0] + gx / g2;
  out[3] = out[1] + gy / g2;
  return true;
}
