import { describe, expect, it } from "vitest";
import { Rasterizer, type SpriteSource } from "../../src/rendering/canvas2d/rasterizer.js";
import { SpriteCache } from "../../src/rendering/canvas2d/spriteCache.js";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { PrimitiveKind } from "../../src/rendering/software/renderQueue.js";
import { renderSprite, type SpriteParams } from "../../src/rendering/software/sprites.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import { AmbientLight, DirectionalLight, PointLight } from "../../src/scene/light.js";
import { SphereCloud } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";
import { RecordingContext } from "../helpers/recordingContext.js";

const params = (over: Partial<SpriteParams> = {}): SpriteParams => ({
  baseR: 1,
  baseG: 0.5,
  baseB: 0.25,
  ambientR: 0.1,
  ambientG: 0.1,
  ambientB: 0.1,
  lightR: 1,
  lightG: 1,
  lightB: 1,
  lx: 0,
  ly: 0,
  lz: -1,
  specular: 0,
  shininess: 24,
  ...over,
});

function pixel(data: Uint8ClampedArray, size: number, x: number, y: number): number[] {
  const o = (y * size + x) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

describe("renderSprite", () => {
  it("lights a ball per pixel with a smooth edge", () => {
    const size = 32;
    const data = new Uint8ClampedArray(size * size * 4);
    // Light from the upper left, toward the viewer
    const l = { x: -0.5, y: 0.5, z: -0.7 };
    const len = Math.hypot(l.x, l.y, l.z);
    renderSprite(params({ lx: l.x / len, ly: l.y / len, lz: l.z / len }), size, data);
    const center = pixel(data, size, 16, 16);
    const upperLeft = pixel(data, size, 8, 8);
    const lowerRight = pixel(data, size, 24, 24);
    expect(center[3]).toBe(255);
    expect(upperLeft[0]).toBeGreaterThan(lowerRight[0]);
    // The channels keep the base color's proportions
    expect(center[1] / center[0]).toBeCloseTo(0.5, 1);
    // Outside the disk: transparent; on the rim: partly covered
    expect(pixel(data, size, 0, 0)[3]).toBe(0);
    const rim = pixel(data, size, 16, 0)[3];
    expect(rim).toBeGreaterThan(0);
    expect(rim).toBeLessThan(255);
  });

  it("adds a highlight where the light reflects toward the viewer", () => {
    const size = 32;
    const plain = new Uint8ClampedArray(size * size * 4);
    const shiny = new Uint8ClampedArray(size * size * 4);
    renderSprite(params(), size, plain);
    renderSprite(params({ specular: 0.5 }), size, shiny);
    expect(pixel(shiny, size, 16, 16)[2]).toBeGreaterThan(pixel(plain, size, 16, 16)[2] + 100);
    expect(pixel(shiny, size, 2, 16)[2] - pixel(plain, size, 2, 16)[2]).toBeLessThan(20);
  });
});

describe("lit spheres", () => {
  function cloudScene(shading: "lit" | "sprite", radii: number[], xs: number[]): { scene: Scene; cloud: SphereCloud } {
    const scene = new Scene();
    scene.ambient = new AmbientLight(0.2);
    scene.lights = [new DirectionalLight({ x: 0.3, y: -1, z: 0.4 }, 0.8)];
    const pos: number[] = [];
    for (const x of xs) pos.push(x, 0, 0);
    const cloud = scene.add(new SphereCloud({ count: xs.length, pos, radius: radii }, { shading }));
    return { scene, cloud };
  }

  const camera = (): PerspectiveCamera => new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } });

  it("draws big spheres as sprites and small ones as lit circles", () => {
    const { scene } = cloudScene("sprite", [0.2, 0.2, 0.005], [-0.5, 0.5, 0]);
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera(), 800, 800);
    const kinds = Array.from(e.queue.kind.subarray(0, e.queue.count));
    expect(kinds.filter((k) => k === PrimitiveKind.Sprite).length).toBe(2);
    expect(kinds.filter((k) => k === PrimitiveKind.Circle).length).toBe(1);
  });

  it("shares sprites between alike spheres and frames", () => {
    const { scene } = cloudScene("sprite", [0.2, 0.2, 0.2], [-0.6, 0, 0.6]);
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera(), 800, 800);
    // One directional light: the same light direction and strength for every sphere
    const ids = new Set(Array.from(e.queue.style.subarray(0, e.queue.count)));
    expect(ids.size).toBe(1);
    const made = e.queue.sprites.size;
    e.emitScene(scene, camera(), 800, 800);
    expect(e.queue.sprites.size).toBe(made);
  });

  it("brightens lit spheres near a point light", () => {
    const { scene } = cloudScene("lit", [0.1, 0.1], [-1, 1]);
    scene.lights = [new PointLight({ x: -1, y: 0, z: -0.5 }, { intensity: 0.5 })];
    const e = new SoftwareEmitter();
    e.emitScene(scene, camera(), 800, 800);
    const q = e.queue;
    const brightness = (i: number): number => {
      const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(q.styles.get(q.style[i]).fill!)!;
      return Number(m[1]) + Number(m[2]) + Number(m[3]);
    };
    const near = Array.from({ length: q.count }, (_, i) => i).find((i) => q.coords[q.offset[i]] < 400)!;
    const far = Array.from({ length: q.count }, (_, i) => i).find((i) => q.coords[q.offset[i]] > 400)!;
    expect(brightness(near)).toBeGreaterThan(brightness(far));
  });
});

describe("drawing sprites", () => {
  it("uses one image per sprite at the sphere's size, or plain circles without images", () => {
    const { queue } = new SoftwareEmitter();
    const id = queue.sprites.add(params());
    queue.pushSprite(2, id, 1, 100, 100, 10);
    queue.pushSprite(2, id, 2, 200, 100, 20);
    queue.sort();

    const asked: number[] = [];
    const image = {} as CanvasImageSource;
    const source: SpriteSource = {
      get: (_id, _params, pixels) => {
        asked.push(pixels);
        return image;
      },
    };
    const r = new Rasterizer();
    r.sprites = source;
    r.pixelRatio = 2;
    const ctx = new RecordingContext();
    expect(r.draw(ctx, queue)).toBe(2);
    // Far to near: the radius-20 sprite was pushed farther away
    expect(ctx.images).toEqual([
      [180, 80, 40, 40],
      [90, 90, 20, 20],
    ]);
    expect(asked).toEqual([80, 40]);

    const plain = new Rasterizer();
    const ctx2 = new RecordingContext();
    expect(plain.draw(ctx2, queue)).toBe(1);
    expect(ctx2.calls.filter((c) => c === "arc").length).toBe(2);
  });

  it("renders each sprite once per resolution and starts over on a new generation", () => {
    const made: number[] = [];
    const fakeCanvas = (w: number): OffscreenCanvas => {
      made.push(w);
      const ctx = {
        createImageData: (cw: number, ch: number) => ({ data: new Uint8ClampedArray(cw * ch * 4) }),
        putImageData: () => {},
      };
      return { getContext: () => ctx } as unknown as OffscreenCanvas;
    };
    const cache = new SpriteCache(fakeCanvas);
    const p = params();
    const a = cache.get(0, p, 20, 0);
    expect(cache.get(0, p, 30, 0)).toBe(a);
    cache.get(0, p, 100, 0);
    // Larger than the largest size: that one, scaled up
    cache.get(0, p, 1000, 0);
    expect(made).toEqual([32, 128]);
    cache.get(0, p, 20, 1);
    expect(made).toEqual([32, 128, 32]);
    expect(cache.rendered).toBe(3);
  });
});
