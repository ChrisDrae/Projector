import { describe, expect, it } from "vitest";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { PrimitiveKind } from "../../src/rendering/software/renderQueue.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { Mesh } from "../../src/scene/mesh.js";
import { MeshNode, SphereCloud } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";

function countKind(e: SoftwareEmitter, kind: number): number {
  let n = 0;
  for (let i = 0; i < e.queue.count; i++) if (e.queue.kind[i] === kind) n++;
  return n;
}

describe("SoftwareEmitter", () => {
  it("culls back faces: a box seen head-on shows one face, from a corner three", () => {
    const scene = new Scene();
    scene.add(new MeshNode(Mesh.box(1)));
    const e = new SoftwareEmitter();

    const camera = new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } });
    e.emitScene(scene, camera, 800, 800);
    expect(countKind(e, PrimitiveKind.Polygon)).toBe(1);

    camera.position = { x: 3, y: 3, z: -3 };
    camera.lookAt({ x: 0, y: 0, z: 0 });
    e.emitScene(scene, camera, 800, 800);
    expect(countKind(e, PrimitiveKind.Polygon)).toBe(3);
  });

  it("draws both sides of double-sided meshes", () => {
    const scene = new Scene();
    const node = scene.add(new MeshNode(Mesh.plane(1, 1), { side: "double" }));
    const camera = new PerspectiveCamera({ position: { x: 0, y: -2, z: -0.5 } });
    camera.lookAt({ x: 0, y: 0, z: 0 });
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera, 800, 800);
    expect(countKind(e, PrimitiveKind.Polygon)).toBe(1);
    node.material.side = "front";
    e.emitScene(scene, camera, 800, 800);
    expect(countKind(e, PrimitiveKind.Polygon)).toBe(0);
  });

  it("emits 12 lines for a wireframe box", () => {
    const scene = new Scene();
    scene.add(new MeshNode(Mesh.box(1), { wireframe: true }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }), 800, 800);
    expect(countKind(e, PrimitiveKind.Line)).toBe(12);
  });

  it("clips geometry crossing the camera instead of producing garbage", () => {
    const scene = new Scene();
    scene.add(new MeshNode(Mesh.box(4), { side: "double" }));
    const e = new SoftwareEmitter();
    // Camera inside the box
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0.5, y: 0.2, z: 0 } }), 800, 800);
    const c = e.queue.coords;
    for (let i = 0; i < e.queue.coordCount; i++) expect(Number.isFinite(c[i])).toBe(true);
    expect(e.queue.count).toBeGreaterThan(0);
  });

  it("projects spheres with perspective size and culls the ones behind the camera", () => {
    const source = {
      count: 3,
      pos: Float32Array.from([0, 0, 0, 0, 0, 2, 0, 0, -5]),
      radius: Float32Array.from([0.1, 0.1, 0.1]),
    };
    const scene = new Scene();
    scene.add(new SphereCloud(source, { depthCue: 0 }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera(), 800, 800);
    expect(e.queue.count).toBe(2);
    expect(e.culled).toBe(1);
    // r_screen = (focal * height / 2) * r / z: 400 * 0.1 / 1.5 at the origin
    expect(e.queue.coords[e.queue.offset[0] + 2]).toBeCloseTo((400 * 0.1) / 1.5, 4);
    // No depth cue: every sphere shares one style
    expect(e.queue.style[0]).toBe(e.queue.style[1]);
  });

  it("uses at most shadeLevels styles per palette color for depth cueing", () => {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos[i * 3 + 2] = i / 100;
    const scene = new Scene();
    scene.add(new SphereCloud({ count: n, pos, radius: new Float32Array(n).fill(0.01) }, { shadeLevels: 8 }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera(), 800, 800);
    expect(new Set(Array.from(e.queue.style.subarray(0, e.queue.count))).size).toBe(8);
  });
});
