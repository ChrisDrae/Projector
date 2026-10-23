import { describe, expect, it } from "vitest";
import * as mat4 from "../../src/math/mat4.js";
import { placeOrbitCamera } from "../../src/controls/orbitControls.js";
import type { EmitContext } from "../../src/rendering/software/emit.js";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { PrimitiveKind } from "../../src/rendering/software/renderQueue.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { Material } from "../../src/scene/material.js";
import { Mesh } from "../../src/scene/mesh.js";
import { Layer, MeshNode, type CustomNode } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";

const camera = (): PerspectiveCamera => new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } });

class Marker implements CustomNode {
  readonly kind = "custom" as const;
  visible = true;
  layer: number = Layer.World;
  results: boolean[] = [];

  emit(ctx: EmitContext): void {
    const s = ctx.style("#fff", "#000");
    this.results.push(
      ctx.polygon3D(this.layer, s, [0, 0, 0, 1, 0, 0, 1, 1, 0], 3),
      ctx.line3D(this.layer, s, 0, 0, 0, 1, 1, 1),
      ctx.circle3D(this.layer, s, 0, 0, 0, 0.5),
      // Entirely behind the camera
      ctx.circle3D(this.layer, s, 0, 0, -10, 0.5),
    );
  }
}

describe("custom nodes", () => {
  it("draw through the emit context with clipping and culling", () => {
    const scene = new Scene();
    const marker = scene.add(new Marker());
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera(), 800, 800);
    expect(marker.results).toEqual([true, true, true, false]);
    const kinds = Array.from(e.queue.kind.subarray(0, e.queue.count));
    expect(kinds).toEqual([PrimitiveKind.Polygon, PrimitiveKind.Line, PrimitiveKind.Circle]);
    // The circle at the origin, 3 units away, projects to the screen center with radius sy * r / z
    const o = e.queue.offset[2];
    expect(e.queue.coords[o]).toBeCloseTo(400);
    expect(e.queue.coords[o + 1]).toBeCloseTo(400);
    expect(e.queue.coords[o + 2]).toBeCloseTo((400 * 0.5) / 3);
  });

  it("can draw meshes with their own matrix", () => {
    const scene = new Scene();
    const box = Mesh.box(1);
    const material = new Material();
    const world = mat4.create();
    scene.add({
      kind: "custom",
      visible: true,
      layer: Layer.World,
      emit: (ctx: EmitContext) => ctx.drawMesh(box, material, world),
    });
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera(), 800, 800);
    expect(e.queue.count).toBe(1);
  });
});

describe("scene graph and sorting", () => {
  it("composes a node's transform with its parent matrix", () => {
    const scene = new Scene();
    const node = scene.add(new MeshNode(Mesh.box(0.2)));
    const parent = mat4.create();
    parent[12] = 1; // translate +1 x
    node.transform.position.x = 0.5;
    node.parentMatrix = parent;
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera(), 800, 800);
    const o = e.queue.offset[0];
    let x = 0;
    for (let k = 0; k < e.queue.size[0]; k++) x += e.queue.coords[o + k * 2];
    x /= e.queue.size[0];
    // Face center at x = 1.5, z = -0.1 relative to the camera at -3: 400 + 400 * 1.5 / 2.9
    expect(x).toBeCloseTo(400 + (400 * 1.5) / 2.9, 0);
  });

  it("gives every face of an object-sorted mesh the depth of its origin", () => {
    const scene = new Scene();
    const node = scene.add(new MeshNode(Mesh.box(1)));
    node.sortMode = "object";
    const cam = new PerspectiveCamera({ position: { x: 3, y: 2, z: -3 } });
    cam.lookAt({ x: 0, y: 0, z: 0 });
    const e = new SoftwareEmitter();
    e.emitScene(scene, cam, 800, 800);
    expect(e.queue.count).toBe(3);
    const d = Array.from(e.queue.depth.subarray(0, 3));
    expect(d[0]).toBeCloseTo(Math.hypot(3, 2, 3), 4);
    expect(d[1]).toBe(d[0]);
    expect(d[2]).toBe(d[0]);
  });

  it("draws the shadow layer between the background and the world", () => {
    const e = new SoftwareEmitter();
    const q = e.queue;
    const s = q.styles.intern("#000");
    q.pushCircle(Layer.World, s, 1, 0, 0, 1);
    q.pushCircle(Layer.Shadow, s, 1, 0, 0, 1);
    q.pushCircle(Layer.Background, s, 1, 0, 0, 1);
    q.pushCircle(Layer.Overlay, s, 1, 0, 0, 1);
    q.sort();
    const layers = Array.from(q.order.subarray(0, q.count)).map((i) => q.layer[i]);
    expect(layers).toEqual([Layer.Background, Layer.Shadow, Layer.World, Layer.Overlay]);
  });
});

describe("placeOrbitCamera", () => {
  it("puts the camera at the distance from the target, looking at it", () => {
    const cam = new PerspectiveCamera();
    const target = { x: 1, y: 2, z: 3 };
    placeOrbitCamera(cam, target, 5, 0.7, -0.4);
    const p = cam.position;
    expect(Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z)).toBeCloseTo(5);
    const f = cam.getForward({ x: 0, y: 0, z: 0 });
    expect(f.x).toBeCloseTo((target.x - p.x) / 5);
    expect(f.y).toBeCloseTo((target.y - p.y) / 5);
    expect(f.z).toBeCloseTo((target.z - p.z) / 5);
    // Looking down from above
    expect(p.y).toBeGreaterThan(target.y);
  });
});
