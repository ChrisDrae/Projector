import { describe, expect, it } from "vitest";
import { Rasterizer } from "../../src/rendering/canvas2d/rasterizer.js";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { triangleGradient } from "../../src/rendering/software/gradient.js";
import { PrimitiveKind } from "../../src/rendering/software/renderQueue.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { AmbientLight, DirectionalLight, PointLight } from "../../src/scene/light.js";
import { Mesh } from "../../src/scene/mesh.js";
import { Layer, MeshNode, SphereCloud } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";
import { RecordingContext } from "../helpers/recordingContext.js";

function count(e: SoftwareEmitter, kind: number, layer?: number): number {
  let n = 0;
  for (let i = 0; i < e.queue.count; i++) {
    if (e.queue.kind[i] === kind && (layer === undefined || e.queue.layer[i] === layer)) n++;
  }
  return n;
}

/** Value of a gradient from (x0, y0) [t = 0] to (x1, y1) [t = 1] at a point, unclamped. */
function along(line: Float64Array, x: number, y: number): number {
  const dx = line[2] - line[0];
  const dy = line[3] - line[1];
  return ((x - line[0]) * dx + (y - line[1]) * dy) / (dx * dx + dy * dy);
}

describe("triangle gradients", () => {
  it("reproduce the interpolated value exactly at the corners and inside", () => {
    const line = new Float64Array(4);
    const corners = [
      [10, 20, 0.2],
      [300, 40, 0.9],
      [120, 260, 0.5],
    ];
    expect(triangleGradient(10, 20, 0.2, 300, 40, 0.9, 120, 260, 0.5, line)).toBe(true);
    for (const [x, y, t] of corners) expect(along(line, x, y)).toBeCloseTo(t, 10);
    // The centroid gets the average, as linear interpolation does
    expect(along(line, (10 + 300 + 120) / 3, (20 + 40 + 260) / 3)).toBeCloseTo((0.2 + 0.9 + 0.5) / 3, 10);
  });

  it("report flat triangles and degenerate ones", () => {
    const line = new Float64Array(4);
    expect(triangleGradient(0, 0, 0.5, 10, 0, 0.5, 0, 10, 0.5, line)).toBe(false);
    expect(triangleGradient(0, 0, 0, 10, 10, 1, 20, 20, 0.5, line)).toBe(false);
  });
});

describe("smooth shading", () => {
  function sphereScene(shading: "flat" | "smooth"): Scene {
    const scene = new Scene();
    scene.ambient = new AmbientLight(0.1);
    scene.lights = [new DirectionalLight({ x: 1, y: -1, z: 1 }, 0.9)];
    scene.add(new MeshNode(Mesh.icosphere(1, 2), { color: "#4488cc", shading }));
    return scene;
  }

  it("fills curved faces with gradients and keeps evenly lit faces batched", () => {
    const e = new SoftwareEmitter();
    const cam = new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } });
    e.emitScene(sphereScene("smooth"), cam, 800, 800);
    const gradients = count(e, PrimitiveKind.GradientPolygon);
    const flat = count(e, PrimitiveKind.Polygon);
    expect(gradients).toBeGreaterThan(20);
    // The dark side under ambient light only has one color everywhere: plain batched polygons
    expect(flat).toBeGreaterThan(10);

    const flatShaded = new SoftwareEmitter();
    flatShaded.emitScene(sphereScene("flat"), cam, 800, 800);
    expect(count(flatShaded, PrimitiveKind.GradientPolygon)).toBe(0);
  });

  it("rasterizes every gradient polygon with its own gradient and fill", () => {
    const e = new SoftwareEmitter();
    e.emitScene(sphereScene("smooth"), new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }), 800, 800);
    e.queue.sort();
    const ctx = new RecordingContext();
    const r = new Rasterizer();
    const calls = r.draw(ctx, e.queue);
    const gradients = count(e, PrimitiveKind.GradientPolygon);
    expect(ctx.gradients.length).toBe(gradients);
    for (const g of ctx.gradients) {
      expect(g.stops.map((s) => s[0])).toEqual([0, 1]);
      for (const [, css] of g.stops) expect(css).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    }
    expect(calls).toBeGreaterThanOrEqual(gradients);
    expect(ctx.calls.filter((c) => c === "fill").length).toBe(calls);
  });

  it("varies the gradient along the light: brighter toward the lit side", () => {
    const scene = new Scene();
    scene.ambient = new AmbientLight(0);
    scene.lights = [new DirectionalLight({ x: -1, y: 0, z: 0 }, 1)];
    scene.add(new MeshNode(Mesh.icosphere(1, 1), { color: "#ffffff", shading: "smooth" }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }), 800, 800);
    const q = e.queue;
    let checked = 0;
    for (let i = 0; i < q.count; i++) {
      if (q.kind[i] !== PrimitiveKind.GradientPolygon) continue;
      const g = q.offset[i] + q.size[i] * 2;
      const [x0, , x1, , from, to] = Array.from(q.coords.subarray(g, g + 6));
      // Light comes from +x (screen right): the brighter end of each gradient lies further right
      const brighter = to > from ? x1 : x0;
      const darker = to > from ? x0 : x1;
      expect(brighter).toBeGreaterThan(darker);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe("planar shadows", () => {
  /** Camera high above the origin looking straight down: screen x follows world x. */
  function topCamera(): PerspectiveCamera {
    const cam = new PerspectiveCamera({ position: { x: 0, y: 6, z: 0 } });
    cam.lookAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    return cam;
  }

  function floorScene(direction = { x: 0, y: -1, z: 0 }, castShadow = true): { scene: Scene; floor: MeshNode } {
    const scene = new Scene();
    scene.lights = [new DirectionalLight(direction, 0.8, { castShadow })];
    const floor = scene.add(new MeshNode(Mesh.grid(4, 8), { color: "#888" }));
    floor.layer = Layer.Background;
    floor.receiveShadow = true;
    return { scene, floor };
  }

  function shadowCenterX(e: SoftwareEmitter): number {
    const q = e.queue;
    let x = 0;
    let n = 0;
    for (let i = 0; i < q.count; i++) {
      if (q.layer[i] !== Layer.Shadow) continue;
      for (let k = 0; k < q.size[i]; k++) {
        x += q.coords[q.offset[i] + k * 2];
        n++;
      }
    }
    return x / n;
  }

  it("projects a box's light-facing faces onto the floor along the light", () => {
    const { scene } = floorScene({ x: 1, y: -1, z: 0 });
    const box = scene.add(new MeshNode(Mesh.box(0.2)));
    box.castShadow = true;
    box.transform.position.y = 1;
    const e = new SoftwareEmitter();
    const cam = topCamera();
    e.emitScene(scene, cam, 800, 800);
    // Lit faces: top and the -x side
    expect(count(e, PrimitiveKind.Polygon, Layer.Shadow)).toBe(2);
    // Light at 45 degrees: the shadow lands 1 unit along +x
    const out = { x: 0, y: 0 };
    e.project(1, 0, 0, out);
    expect(shadowCenterX(e)).toBeCloseTo(out.x, -1);

    // All shadows of a receiver share one style: a single draw call
    e.queue.sort();
    const styles = new Set<number>();
    for (let i = 0; i < e.queue.count; i++) if (e.queue.layer[i] === Layer.Shadow) styles.add(e.queue.style[i]);
    expect(styles.size).toBe(1);
  });

  it("stretches sphere shadows into ellipses by 1 / cos of the light angle", () => {
    const { scene } = floorScene({ x: Math.sin(Math.PI / 3), y: -Math.cos(Math.PI / 3), z: 0 });
    const spheres = { count: 1, pos: [0, 0.5, 0], radius: [0.2] };
    scene.add(new SphereCloud(spheres, { castShadow: true }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, topCamera(), 800, 800);
    const q = e.queue;
    const i = Array.from(q.layer.subarray(0, q.count)).indexOf(Layer.Shadow);
    expect(i).toBeGreaterThanOrEqual(0);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < q.size[i]; k++) {
      const x = q.coords[q.offset[i] + k * 2];
      const y = q.coords[q.offset[i] + k * 2 + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    // Light 60 degrees from vertical: the shadow is twice as long along the light as across it
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(2, 1);
  });

  it("clips shadows to the receiver and skips them when nothing casts or receives", () => {
    const { scene, floor } = floorScene();
    const big = scene.add(new MeshNode(Mesh.box(10, 0.1, 0.4)));
    big.castShadow = true;
    big.transform.position.y = 1;
    const e = new SoftwareEmitter();
    const cam = topCamera();
    e.emitScene(scene, cam, 800, 800);
    const q = e.queue;
    const edge = { x: 0, y: 0 };
    e.project(2, 0, 0, edge);
    for (let i = 0; i < q.count; i++) {
      if (q.layer[i] !== Layer.Shadow) continue;
      for (let k = 0; k < q.size[i]; k++) expect(q.coords[q.offset[i] + k * 2]).toBeLessThanOrEqual(edge.x + 0.5);
    }

    floor.receiveShadow = false;
    e.emitScene(scene, cam, 800, 800);
    expect(count(e, PrimitiveKind.Polygon, Layer.Shadow)).toBe(0);

    floor.receiveShadow = true;
    (scene.lights[0] as DirectionalLight).castShadow = false;
    e.emitScene(scene, cam, 800, 800);
    expect(count(e, PrimitiveKind.Polygon, Layer.Shadow)).toBe(0);
  });

  it("spreads shadows from point lights and hides them when the camera is below the floor", () => {
    const scene = new Scene();
    scene.lights = [new PointLight({ x: 0, y: 2, z: 0 }, { castShadow: true })];
    const floor = scene.add(new MeshNode(Mesh.plane(4, 4)));
    floor.receiveShadow = true;
    const spheres = { count: 1, pos: [0, 1, 0], radius: [0.2] };
    scene.add(new SphereCloud(spheres, { castShadow: true }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, topCamera(), 800, 800);
    expect(count(e, PrimitiveKind.Polygon, Layer.Shadow)).toBe(1);

    const below = new PerspectiveCamera({ position: { x: 0, y: -3, z: 0 } });
    below.lookAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    e.emitScene(scene, below, 800, 800);
    expect(count(e, PrimitiveKind.Polygon, Layer.Shadow)).toBe(0);
  });
});
