import type { PerspectiveCamera } from "../../scene/camera.js";

/**
 * View space to pixels. With the camera's focal length f, a view-space point (x, y, z) lands at
 *   cx + sx * x / z,  cy - sy * y / z
 * which is the original x' = x / z, y' = y / z formula scaled to the canvas, with y flipped.
 */
export interface ProjectionParams {
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  near: number;
  far: number;
  width: number;
  height: number;
}

export function createProjection(): ProjectionParams {
  return { sx: 1, sy: 1, cx: 0, cy: 0, near: 0.01, far: 1000, width: 1, height: 1 };
}

export function updateProjection(
  out: ProjectionParams,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): ProjectionParams {
  const f = camera.focalLength;
  out.sy = (f * height) / 2;
  out.sx = ((f / camera.aspect) * width) / 2;
  out.cx = width / 2;
  out.cy = height / 2;
  out.near = camera.near;
  out.far = camera.far;
  out.width = width;
  out.height = height;
  return out;
}

export function projectX(p: ProjectionParams, x: number, z: number): number {
  return p.cx + (p.sx * x) / z;
}

export function projectY(p: ProjectionParams, y: number, z: number): number {
  return p.cy - (p.sy * y) / z;
}

/** On-screen radius of a sphere of radius r at view depth z. */
export function sphereScreenRadius(p: ProjectionParams, r: number, z: number): number {
  return (p.sy * r) / z;
}
