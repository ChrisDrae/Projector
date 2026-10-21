import { describe, expect, it } from "vitest";
import { SimObject } from "../../src/framework/simObject.js";
import { Simulation } from "../../src/framework/simulation.js";
import * as mat4 from "../../src/math/mat4.js";
import { SoftwareEmitter } from "../../src/rendering/software/emit.js";
import { Lighting, quantize, quantizedCss } from "../../src/rendering/software/lighting.js";
import { PerspectiveCamera } from "../../src/scene/camera.js";
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PointLight,
  SpotLight,
  attenuation,
  lambert,
} from "../../src/scene/light.js";
import { Material } from "../../src/scene/material.js";
import { Mesh } from "../../src/scene/mesh.js";
import { MeshNode } from "../../src/scene/nodes.js";
import { Scene } from "../../src/scene/scene.js";

/** Camera at the origin looking along +z: view space equals world space. */
const identityView = (): Float64Array => mat4.create();

function lightingFor(scene: Scene): Lighting {
  const l = new Lighting();
  l.update(scene, identityView());
  return l;
}

function onlyLights(...lights: Scene["lights"]): Scene {
  const scene = new Scene();
  scene.ambient = new AmbientLight(0);
  scene.lights = lights;
  return scene;
}

/** Shades a white, non-specular surface at p facing the camera (normal -z). */
function shadeAt(l: Lighting, px: number, py: number, pz: number, nx = 0, ny = 0, nz = -1): [number, number, number] {
  l.shade(nx, ny, nz, px, py, pz, 1, 1, 1, 0, 32, 0, 0, 0);
  return [l.r, l.g, l.b];
}

describe("Lighting", () => {
  it("keeps the original brightness model for white directional lights", () => {
    const scene = new Scene();
    const l = lightingFor(scene);
    expect(l.simple).toBe(true);
    const n = { x: 0.2, y: 0.9, z: -0.3 };
    const len = Math.hypot(n.x, n.y, n.z);
    const unit = { x: n.x / len, y: n.y / len, z: n.z / len };
    expect(l.brightness(unit.x, unit.y, unit.z)).toBeCloseTo(lambert(unit, scene.ambient, scene.lights), 12);
    scene.lights.push(new PointLight());
    expect(lightingFor(scene).simple).toBe(false);
  });

  it("tints diffuse light by the light color", () => {
    const l = lightingFor(onlyLights(new DirectionalLight({ x: 0, y: 0, z: 1 }, 0.5, { color: "#ff8000" })));
    const [r, g, b] = shadeAt(l, 0, 0, 2);
    expect(r).toBeCloseTo(0.5);
    expect(g).toBeCloseTo(0.5 * (128 / 255));
    expect(b).toBeCloseTo(0);
  });

  it("falls off with distance for point lights", () => {
    expect(attenuation(2, 0, 2)).toBeCloseTo(0.25);
    expect(attenuation(1, 0, 1)).toBeCloseTo(1);
    // The window cuts the light off at its distance
    expect(attenuation(3, 3, 2)).toBe(0);
    expect(attenuation(1.5, 3, 2)).toBeGreaterThan(0);
    const l = lightingFor(onlyLights(new PointLight({ x: 0, y: 0, z: 0 }, { intensity: 1 })));
    expect(shadeAt(l, 0, 0, 1)[0]).toBeCloseTo(1);
    expect(shadeAt(l, 0, 0, 2)[0]).toBeCloseTo(0.25);
    // Facing away from the light: dark
    expect(shadeAt(l, 0, 0, 2, 0, 0, 1)[0]).toBe(0);
  });

  it("limits spot lights to their cone with a soft edge", () => {
    const spot = new SpotLight({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { angle: 0.3, penumbra: 0.5, decay: 0 });
    const l = lightingFor(onlyLights(spot));
    const at = (angle: number): number => shadeAt(l, Math.tan(angle), 0, 1, -Math.sin(angle), 0, -Math.cos(angle))[0];
    expect(at(0)).toBeCloseTo(1);
    expect(at(0.1)).toBeCloseTo(1);
    const edge = at(0.25);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(at(0.35)).toBe(0);
  });

  it("adds a Blinn-Phong highlight where the light reflects toward the camera", () => {
    // Light behind the camera: the surface facing the camera reflects it straight back
    const l = lightingFor(onlyLights(new DirectionalLight({ x: 0, y: 0, z: 1 }, 1)));
    l.shade(0, 0, -1, 0, 0, 2, 0.5, 0.5, 0.5, 0.4, 16, 0, 0, 0);
    expect(l.r).toBeCloseTo(0.5 + 0.4);
    // Tilted away from the mirror direction, the highlight fades much faster than the diffuse light
    const n = { x: Math.sin(0.4), y: 0, z: -Math.cos(0.4) };
    l.shade(n.x, n.y, n.z, 0, 0, 2, 0.5, 0.5, 0.5, 0.4, 16, 0, 0, 0);
    const diffuse = 0.5 * Math.cos(0.4);
    expect(l.r - diffuse).toBeLessThan(0.4 * 0.5);
    expect(l.r - diffuse).toBeGreaterThan(0);
  });

  it("blends hemisphere light from sky to ground by the normal", () => {
    const scene = onlyLights(new HemisphereLight("#ffffff", "#000000", 1));
    const l = lightingFor(scene);
    expect(shadeAt(l, 0, 0, 1, 0, 1, 0)[0]).toBeCloseTo(1);
    expect(shadeAt(l, 0, 0, 1, 0, -1, 0)[0]).toBeCloseTo(0);
    expect(shadeAt(l, 0, 0, 1, 1, 0, 0)[0]).toBeCloseTo(0.5);
  });

  it("adds emissive light and fades into fog", () => {
    const scene = onlyLights();
    scene.fog = { color: "#0000ff", near: 1, far: 3 };
    const l = lightingFor(scene);
    l.shade(0, 0, -1, 0, 0, 0.5, 1, 1, 1, 0, 32, 0.2, 0, 0);
    expect(l.r).toBeCloseTo(0.2);
    l.shade(0, 0, -1, 0, 0, 2, 1, 1, 1, 0, 32, 0.2, 0, 0);
    expect(l.r).toBeCloseTo(0.1);
    expect(l.b).toBeCloseTo(0.5);
    l.shade(0, 0, -1, 0, 0, 10, 1, 1, 1, 0, 32, 0.2, 0, 0);
    expect([l.r, l.g, l.b]).toEqual([0, 0, 1]);
  });
});

describe("lit meshes", () => {
  function emitSphere(scene: Scene, material: Material): SoftwareEmitter {
    scene.add(new MeshNode(Mesh.icosphere(1, 2), material));
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: -4 } }), 800, 800);
    return e;
  }

  it("quantizes lit colors into a bounded, reused set of styles", () => {
    const scene = new Scene();
    scene.lights.push(new PointLight({ x: 1, y: 1, z: -2 }, { color: "#ffcc88", intensity: 3 }));
    const material = new Material({ color: "#3366cc", specular: 0.5 });
    const e = emitSphere(scene, material);
    const faces = e.queue.count;
    expect(faces).toBeGreaterThan(100);
    const styles = new Set(Array.from(e.queue.style.subarray(0, faces)));
    // Neighboring faces share quantized colors
    expect(styles.size).toBeLessThan(faces);
    const before = e.queue.styles.size;
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: -4 } }), 800, 800);
    expect(e.queue.styles.size).toBe(before);
  });

  it("matches the quantized color the lighting model computes", () => {
    const scene = onlyLights(new DirectionalLight({ x: 0, y: 0, z: 1 }, 0.6, { color: "#88ff88" }));
    scene.ambient = new AmbientLight(0.2, { color: "#ff0000" });
    const box = Mesh.box(1);
    scene.add(new MeshNode(box, { color: "#808080", emissive: "#000033" }));
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }), 800, 800);
    expect(e.queue.count).toBe(1);
    const base = 128 / 255;
    const r = base * (0.2 + 0.6 * (136 / 255));
    const g = base * 0.6;
    const b = base * 0.6 * (136 / 255) + 51 / 255;
    expect(e.queue.styles.get(e.queue.style[0]).fill).toBe(quantizedCss(quantize(r, g, b)));
  });

  it("shades custom geometry like meshes through litStyle", () => {
    const scene = onlyLights(new PointLight({ x: 0, y: 0, z: -1 }, { intensity: 2 }));
    const material = new Material({ color: "#ffffff" });
    let fromContext = -1;
    scene.add({
      kind: "custom",
      visible: true,
      layer: 2,
      emit: (ctx) => {
        fromContext = ctx.litStyle(material, 0, 0, -1, 0, 0, 0);
      },
    });
    const e = new SoftwareEmitter();
    e.emitScene(scene, new PerspectiveCamera({ position: { x: 0, y: 0, z: -3 } }), 800, 800);
    // Distance 1 from the light, facing it: full intensity 2, clamped to white
    expect(e.queue.styles.get(fromContext).fill).toBe("rgb(255, 255, 255)");
  });
});

describe("lights on objects", () => {
  it("point and spot lights follow the object they are added to", () => {
    const sim = new Simulation();
    const lamp = sim.add(new SimObject());
    const point = lamp.addLight(new PointLight({ x: 0, y: 1, z: 0 }));
    const spot = lamp.addLight(new SpotLight({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    expect(sim.scene.lights).toContain(point);
    lamp.transform.position.x = 2;
    lamp.transform.rotateWorld(0, 0, Math.PI / 2);
    sim.frame(0);
    expect(point.position.x).toBeCloseTo(2 - 1);
    expect(point.position.y).toBeCloseTo(0);
    expect(spot.direction.x).toBeCloseTo(1);
    expect(spot.direction.y).toBeCloseTo(0);
    sim.remove(lamp);
    expect(sim.scene.lights).not.toContain(point);
  });
});
