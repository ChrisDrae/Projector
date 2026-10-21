import { describe, expect, it } from "vitest";
import { Lighting } from "../../src/rendering/software/lighting.js";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import * as mat4 from "../../src/math/mat4.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { Mesh } from "../../src/scene/mesh.js";
import { LineSet, MeshNode, PointCloud, SphereCloud } from "../../src/scene/nodes.js";
import { Scene, type Fog } from "../../src/scene/scene.js";

/** Straight ahead at distance 10, and off to the side at the same distance but depth 8. */
const AHEAD = { x: 0, y: 0, z: 10 };
const SIDE = { x: 6, y: 0, z: 8 };

function fog(mode?: Fog["mode"]): Fog {
  return { color: "#ffffff", near: 0, far: 20, mode };
}

function quad(c: { x: number; y: number; z: number }): Mesh {
  const h = 0.1;
  return new Mesh([c.x - h, c.y - h, c.z, c.x + h, c.y - h, c.z, c.x + h, c.y + h, c.z, c.x - h, c.y + h, c.z], [[0, 1, 2, 3]]);
}

/** Style ids of the primitives emitted for the thing ahead and the thing to the side. */
function stylesOf(scene: Scene): [number, number] {
  const e = new SoftwareEmitter();
  e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: 0 } }), 800, 800);
  expect(e.queue.count).toBe(2);
  // The queue is unsorted here: primitives in emit order
  return [e.queue.style[0], e.queue.style[1]];
}

describe("fog modes", () => {
  it("measures fog by depth by default and by distance in distance mode", () => {
    const l = new Lighting();
    const scene = new Scene({ fog: fog() });
    l.update(scene, mat4.create());
    expect(l.fogAt(SIDE.x, SIDE.y, SIDE.z)).toBeCloseTo(0.4);
    scene.fog = fog("distance");
    l.update(scene, mat4.create());
    expect(l.fogAt(SIDE.x, SIDE.y, SIDE.z)).toBeCloseTo(0.5);
    expect(l.fogAt(AHEAD.x, AHEAD.y, AHEAD.z)).toBeCloseTo(0.5);
  });

  for (const shading of ["unlit", "flat"] as const) {
    it(`fogs ${shading} faces at the same distance alike only in distance mode`, () => {
      const scene = new Scene({ fog: fog() });
      scene.lights = [];
      for (const c of [AHEAD, SIDE]) scene.add(new MeshNode(quad(c), { color: "#000000", shading, side: "double" }));
      const [a, b] = stylesOf(scene);
      expect(a).not.toBe(b);
      scene.fog = fog("distance");
      const [c, d] = stylesOf(scene);
      expect(c).toBe(d);
    });
  }

  it("fogs spheres, points and lines by distance too", () => {
    const source = { count: 2, pos: [AHEAD.x, AHEAD.y, AHEAD.z, SIDE.x, SIDE.y, SIDE.z], radius: [0.1, 0.1] };
    for (const make of [
      (s: Scene) => s.add(new SphereCloud(source, { color: "#000000", shadeLevels: 64 })),
      (s: Scene) => s.add(new SphereCloud(source, { color: "#000000", shading: "lit" })),
      (s: Scene) => s.add(new PointCloud(source, { color: "#000000", shadeLevels: 64 })),
      (s: Scene) => {
        const lines = s.add(new LineSet(2, { color: "#000000" }));
        lines.setSegment(0, AHEAD.x - 0.1, 0, AHEAD.z, AHEAD.x + 0.1, 0, AHEAD.z);
        lines.setSegment(1, SIDE.x - 0.1, 0, SIDE.z, SIDE.x + 0.1, 0, SIDE.z);
        lines.count = 2;
      },
    ]) {
      const scene = new Scene({ fog: fog() });
      scene.lights = [];
      make(scene);
      const [a, b] = stylesOf(scene);
      expect(a).not.toBe(b);
      scene.fog = fog("distance");
      const [c, d] = stylesOf(scene);
      expect(c).toBe(d);
    }
  });
});
