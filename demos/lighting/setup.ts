import {
  AmbientLight,
  DirectionalLight,
  Ground,
  HemisphereLight,
  Mesh,
  MeshObject,
  PointLight,
  SimObject,
  SpotLight,
  type Material,
  type Simulation,
} from "projector";
import type { DemoConfig } from "../shared/config.js";

const BACKGROUND = "#15151a";

export const config: DemoConfig = {
  title: "Lighting",
  help: "Drag: orbit · Wheel: zoom\nPoint and spot lights, smooth vs flat\nshading, highlights, shadows and fog.",
  background: BACKGROUND,
  orbit: { button: 0, target: { x: 0, y: 0.3, z: 0.3 }, distance: 4.2, yaw: 0.6, pitch: -0.42 },
  world: { gravity: { x: 0, y: 0, z: 0 } },
};

export interface LightingDemo {
  key: DirectionalLight;
  spot: SpotLight;
  lamps: PointLight[];
  /** Materials of the curved objects, whose shading can be switched. */
  curved: Material[];
  shiny: Material[];
  setFog(on: boolean): void;
  setShadows(on: boolean): void;
}

/** A small glowing ball carrying a point light, circling the scene. */
class Lamp extends SimObject {
  readonly light: PointLight;
  private angle: number;

  constructor(
    color: string,
    private readonly radius: number,
    private readonly height: number,
    private readonly speed: number,
    phase: number,
  ) {
    super({ name: "lamp" });
    this.angle = phase;
    this.light = this.addLight(new PointLight({ x: 0, y: 0, z: 0 }, { color, intensity: 1.6, distance: 5 }));
    this.addChild(new MeshObject(Mesh.icosphere(0.06, 1), { color, shading: "unlit" }));
  }

  override update(dt: number): void {
    this.angle += dt * this.speed;
    this.transform.position.x = Math.cos(this.angle) * this.radius;
    this.transform.position.z = Math.sin(this.angle) * this.radius + 0.3;
    this.transform.position.y = this.height + Math.sin(this.angle * 2) * 0.15;
  }
}

export function setup(sim: Simulation): LightingDemo {
  const scene = sim.scene;
  scene.ambient = new AmbientLight(0.1);
  const key = new DirectionalLight({ x: -0.6, y: -1, z: 0.45 }, 0.55, { castShadow: true });
  const spot = new SpotLight({ x: 0, y: 3.2, z: 0.3 }, { x: 0, y: -1, z: 0 }, {
    color: "#fff4d6",
    intensity: 6,
    angle: 0.42,
    penumbra: 0.45,
  });
  scene.lights = [new HemisphereLight("#8fa8ff", "#3a2f28", 0.3), key, spot];
  scene.shadow = { color: "#000000", opacity: 0.4 };

  sim.add(
    new Ground({
      style: "plane",
      size: 7,
      divisions: 24,
      color: "#55555f",
      opacity: 1,
      collider: false,
      material: { shading: "smooth" },
    }),
  );

  const curved: Material[] = [];
  const shiny: Material[] = [];
  const place = (object: MeshObject, x: number, y: number, z: number): MeshObject => {
    object.transform.position.x = x;
    object.transform.position.y = y;
    object.transform.position.z = z;
    return sim.add(object);
  };
  const solid = { castShadow: true, sortMode: "object" as const };

  const smoothBall = place(
    new MeshObject(Mesh.icosphere(0.45, 2), { color: "#e0a23a", shading: "smooth", specular: 0.6, shininess: 40 }, solid),
    -1.15,
    0.45,
    0,
  );
  const flatBall = place(
    new MeshObject(Mesh.icosphere(0.45, 2), { color: "#e0a23a", shading: "flat", specular: 0.6, shininess: 40 }, solid),
    0,
    0.45,
    0,
  );
  const capsule = place(
    new MeshObject(Mesh.capsule(0.24, 0.3, 18, 5), { color: "#4fb0e8", shading: "smooth", specular: 0.4, shininess: 24 }, solid),
    1.15,
    0.54,
    0,
  );
  const cylinder = place(
    new MeshObject(Mesh.cylinder(0.3, 0.8, 20), { color: "#d618c6", shading: "smooth", specular: 0.3 }, solid),
    0.6,
    0.4,
    1.25,
  );
  const box = place(new MeshObject(Mesh.box(0.55), { color: "#a0d45b", specular: 0.2 }, solid), -0.75, 0.275, 1.3);
  curved.push(smoothBall.material, capsule.material, cylinder.material);
  shiny.push(smoothBall.material, flatBall.material, capsule.material, cylinder.material, box.material);

  const lamps = [
    sim.add(new Lamp("#ff9a3c", 1.9, 0.9, 0.5, 0)),
    sim.add(new Lamp("#3cc8ff", 1.6, 1.3, -0.7, Math.PI)),
  ].map((l) => l.light);

  sim.onUpdate((dt) => {
    box.transform.rotateWorld(0, dt * 0.6, 0);
  });

  return {
    key,
    spot,
    lamps,
    curved,
    shiny,
    setFog(on) {
      scene.fog = on ? { color: BACKGROUND, near: 3, far: 9 } : null;
    },
    setShadows(on) {
      key.castShadow = on;
    },
  };
}
