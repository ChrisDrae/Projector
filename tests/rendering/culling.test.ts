import { describe, expect, it } from "vitest";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { PrimitiveKind } from "../../src/rendering/software/renderQueue.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { Mesh } from "../../src/scene/mesh.js";
import { Layer, MeshNode } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";

/** A camera at z = -3 looking along +z with a 90° field of view on a square viewport. */
function setup(): { scene: Scene; camera: PerspectiveCamera; e: SoftwareEmitter } {
  return { scene: new Scene(), camera: new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }), e: new SoftwareEmitter() };
}

describe("view culling", () => {
  it("skips meshes behind or beside the camera before transforming them", () => {
    const { scene, camera, e } = setup();
    const node = scene.add(new MeshNode(Mesh.box(1)));
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBe(1);

    node.transform.position = { x: 0, y: 0, z: -6 };
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBe(0);
    expect(e.culled).toBe(6);

    node.transform.position = { x: 6, y: 0, z: 0 };
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBe(0);
    node.transform.position = { x: 0, y: -6, z: 0 };
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBe(0);
  });

  it("scales the bounding sphere with the node", () => {
    const { scene, camera, e } = setup();
    // Centered outside the view, but scaled up it reaches into it
    const node = scene.add(new MeshNode(Mesh.box(1)));
    node.transform.position = { x: 6, y: 0, z: 0 };
    node.transform.scale = { x: 8, y: 8, z: 8 };
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBeGreaterThan(0);
  });

  it("follows mesh changes made with markDirty", () => {
    const { scene, camera, e } = setup();
    const mesh = Mesh.plane(1, 1);
    scene.add(new MeshNode(mesh, { side: "double" }));
    camera.position = { x: 0, y: 3, z: 0 };
    camera.lookAt({ x: 0, y: 0, z: 0.001 });
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBe(1);
    for (let i = 0; i < mesh.vertexCount; i++) mesh.positions[i * 3] += 50;
    mesh.markDirty();
    e.emitScene(scene, camera, 800, 800);
    expect(e.queue.count).toBe(0);
  });

  it("drops polygons that land entirely off screen, keeps those partly on it", () => {
    const { scene, camera, e } = setup();
    e.begin(scene, camera, 800, 800);
    const style = e.style("#fff");
    // At view depth 5 the screen spans x in [-5, 5]
    expect(e.polygon3D(Layer.World, style, [6, 0, 2, 7, 0, 2, 7, 1, 2], 3)).toBe(false);
    expect(e.polygon3D(Layer.World, style, [4, 0, 2, 7, 0, 2, 7, 1, 2], 3)).toBe(true);
    expect(e.queue.count).toBe(1);
  });

  it("drops off-screen faces of a mesh that is partly in view", () => {
    const { scene, camera, e } = setup();
    // A long row of boxes along x: only the middle ones are on screen
    const boxes: number[] = [];
    const faces: number[][] = [];
    for (let k = -20; k <= 20; k++) {
      const v = boxes.length / 3;
      boxes.push(k - 0.4, -0.4, -0.4, k + 0.4, -0.4, -0.4, k + 0.4, 0.4, -0.4, k - 0.4, 0.4, -0.4);
      faces.push([v, v + 3, v + 2, v + 1]);
    }
    scene.add(new MeshNode(new Mesh(boxes, faces)));
    e.emitScene(scene, camera, 800, 800);
    const shown = e.queue.count;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(41);
    expect(e.culled).toBe(41 - shown);
  });
});

describe("sort depth of custom geometry", () => {
  it("uses the given depth for polygon3D and line3D, and the computed one otherwise", () => {
    const { scene, camera, e } = setup();
    e.begin(scene, camera, 800, 800);
    const style = e.style("#fff", "#000");
    e.polygon3D(Layer.World, style, [0, 0, 1, 1, 0, 1, 1, 1, 1], 3, 42);
    e.polygon3D(Layer.World, style, [0, 0, 1, 1, 0, 1, 1, 1, 1], 3);
    e.line3D(Layer.World, style, 0, 0, 1, 1, 0, 3, 7.5);
    e.line3D(Layer.World, style, 0, 0, 1, 1, 0, 3);
    const q = e.queue;
    expect(q.kind[0]).toBe(PrimitiveKind.Polygon);
    expect(q.depth[0]).toBe(42);
    expect(q.depth[1]).toBeCloseTo(4);
    expect(q.kind[2]).toBe(PrimitiveKind.Line);
    expect(q.depth[2]).toBe(7.5);
    expect(q.depth[3]).toBeCloseTo(5);
  });
});
