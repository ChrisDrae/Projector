import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { createProjection, projectX, projectY, updateProjection } from "../../src/rendering/software/projection.js";
import { project, toCamera, toScreenCoordinates } from "../../src/legacy.js";
import * as mat4 from "../../src/math/mat4.js";
import * as vec3 from "../../src/math/vec3.js";
import { Random } from "../../src/utility/random.js";

function screenOf(camera: PerspectiveCamera, w: number, h: number, p: vec3.Vec3): { x: number; y: number } {
  camera.aspect = w / h;
  camera.updateMatrices();
  const proj = updateProjection(createProjection(), camera, w, h);
  const v = mat4.transformPoint(vec3.create(), camera.viewMatrix, p);
  return { x: projectX(proj, v.x, v.z), y: projectY(proj, v.y, v.z) };
}

describe("camera projection", () => {
  it("reproduces the legacy x/z pipeline with the default camera on 800x800", () => {
    const camera = new PerspectiveCamera();
    const rnd = new Random(11);
    for (let i = 0; i < 100; i++) {
      const p = { x: rnd.range(-1, 1), y: rnd.range(-1, 1), z: rnd.range(-0.5, 2) };
      const legacy = toScreenCoordinates(project(toCamera(p)), [800, 800]);
      const now = screenOf(camera, 800, 800, p);
      expect(now.x).toBeCloseTo(legacy.x, 9);
      expect(now.y).toBeCloseTo(legacy.y, 9);
    }
  });

  it("lookAt from the legacy position gives the same view", () => {
    const camera = new PerspectiveCamera({ position: { x: 0, y: 0, z: -1.5 } });
    camera.lookAt({ x: 0, y: 0, z: 5 });
    const p = { x: 0.3, y: -0.2, z: 0.4 };
    const legacy = toScreenCoordinates(project(toCamera(p)), [800, 800]);
    const now = screenOf(camera, 800, 800, p);
    expect(now.x).toBeCloseTo(legacy.x, 9);
    expect(now.y).toBeCloseTo(legacy.y, 9);
  });

  it("keeps circles round on wide canvases (aspect-correct)", () => {
    const camera = new PerspectiveCamera();
    const c = screenOf(camera, 1600, 800, { x: 0, y: 0, z: 0 });
    const right = screenOf(camera, 1600, 800, { x: 0.1, y: 0, z: 0 });
    const up = screenOf(camera, 1600, 800, { x: 0, y: 0.1, z: 0 });
    expect(c).toEqual({ x: 800, y: 400 });
    expect(right.x - c.x).toBeCloseTo(c.y - up.y, 9);
  });

  it("yaw turns right and pitch looks up", () => {
    const camera = new PerspectiveCamera();
    const f = vec3.create();
    camera.setYawPitch(0.5, 0).getForward(f);
    expect(f.x).toBeGreaterThan(0);
    camera.setYawPitch(0, 0.5).getForward(f);
    expect(f.y).toBeGreaterThan(0);
    expect(camera.focalLength).toBeCloseTo(1, 12);
  });
});
