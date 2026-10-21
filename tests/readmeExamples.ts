// The code examples of README.md, type-checked by `npm run typecheck` (never run) so they stay correct.
import {
  DirectionalLight,
  Ground,
  HemisphereLight,
  Layer,
  Mesh,
  MeshObject,
  ParticleGroup,
  PointLight,
  RigidBox,
  RigidSphere,
  SimObject,
  Simulation,
  type CustomNode,
  type EmitContext,
  type World,
} from "projector";

const sim = new Simulation({
  canvas: document.querySelector("canvas")!,
  scene: { background: "#1d2026" },
  orbit: { target: { x: 0, y: 0.5, z: 0 }, distance: 4, pitch: -0.3 },
});
sim.scene.lights = [
  new HemisphereLight("#9db4ff", "#3b3127", 0.4),
  new DirectionalLight({ x: -0.5, y: -1, z: 0.3 }, 0.8, { castShadow: true }),
];

sim.add(new Ground({ style: "plane", size: 8, color: "#4b4f58", opacity: 1 }));
for (let k = 0; k < 5; k++) sim.add(new RigidBox(0.4, { position: { x: 0, y: 0.2 + k * 0.41, z: 0 } }));
sim.add(new RigidSphere(0.2, { position: { x: -2, y: 0.2, z: 0 }, velocity: { x: 6, y: 0, z: 0 } }));

const sand = sim.add(new ParticleGroup({ radius: 0.03, shading: "lit", color: "#e0a23a" }));
sand.spawn(500, (_, p) => {
  p.x = Math.random() - 0.5;
  p.y = 3 + Math.random();
  p.z = Math.random() - 0.5;
});
sim.start();

/** A lamp circling the scene: a point light and a glowing bulb that move with it. */
class Lamp extends SimObject {
  private angle = 0;

  constructor(color: string) {
    super();
    this.addLight(new PointLight({ x: 0, y: 0, z: 0 }, { color, intensity: 2 }));
    this.addChild(new MeshObject(Mesh.icosphere(0.05, 1), { color, shading: "unlit" }));
  }

  override update(dt: number): void {
    this.angle += dt;
    this.transform.position.x = Math.cos(this.angle) * 2;
    this.transform.position.y = 1;
    this.transform.position.z = Math.sin(this.angle) * 2;
  }
}
sim.add(new Lamp("#ffb26b"));

/** Shoots droplets up every frame and recycles one once there are `max`. */
class Fountain extends SimObject {
  readonly drops = new ParticleGroup({ radius: 0.02, shading: "lit", color: "#7fb6ff" });

  constructor(private readonly max: number = 400) {
    super();
    this.addChild(this.drops);
  }

  override update(): void {
    const p = this.transform.position;
    const velocity = { x: Math.random() - 0.5, y: 5, z: Math.random() - 0.5 };
    this.drops.add({ position: { x: p.x, y: p.y, z: p.z }, velocity });
    if (this.drops.count > this.max) this.drops.remove(this.drops.idAt(0));
  }
}
sim.add(new Fountain());

/** Draws every rigid body's velocity as a line on top of the scene. */
class VelocityArrows implements CustomNode {
  readonly kind = "custom" as const;
  visible = true;
  layer: number = Layer.Overlay;

  constructor(private readonly world: World) {}

  emit(ctx: EmitContext): void {
    const style = ctx.style(null, "#ffd166", 2);
    const s = this.world.rigid;
    for (let i = 0; i < s.count; i++) {
      const o = i * 3;
      const [x, y, z] = [s.pos[o], s.pos[o + 1], s.pos[o + 2]];
      ctx.line3D(this.layer, style, x, y, z, x + s.vel[o] * 0.2, y + s.vel[o + 1] * 0.2, z + s.vel[o + 2] * 0.2);
    }
  }
}
sim.scene.add(new VelocityArrows(sim.world));

const water = sim.add(new ParticleGroup({ radius: 0.02, color: "#7fb6ff" }));
const oil = sim.add(new ParticleGroup({ radius: 0.02, color: "#e0a23a" }));
sim.world.setCollision(water.group, oil.group, false);
