// The code examples of README.md, type-checked by `npm run typecheck` (never run) so they stay correct.
import {
  Canvas2DBackend,
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
  type Collider,
  type CustomNode,
  type EmitContext,
  type StaticShapeSink,
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

// "Using Projector in your own project"
class Player extends RigidSphere {
  constructor(position: { x: number; y: number; z: number }) {
    super(0.25, { position, mass: 2, material: { color: "#f1eeee", shading: "smooth", specular: 0.6 } });
    this.addLight(new PointLight({ x: 0, y: 0.6, z: 0 }, { color: "#ffb26b", intensity: 1.5, distance: 4 }));
  }

  override update(): void {
    const kb = this.sim?.keyboard;
    if (!kb) return;
    this.applyForce({ x: kb.axis("ArrowLeft", "ArrowRight") * 6, y: 0, z: kb.axis("ArrowDown", "ArrowUp") * 6 });
  }
}

class CrateSpawner extends SimObject {
  private timer = 0;
  private spawned = 0;

  override update(dt: number): void {
    this.timer += dt;
    if (this.timer < 1 || this.spawned >= 10) return;
    this.timer = 0;
    this.spawned++;
    this.sim!.add(new RigidBox(0.4, { position: { x: Math.random() * 4 - 2, y: 4, z: Math.random() * 4 - 2 } }));
  }
}

const game = new Simulation({
  canvas: document.querySelector("canvas")!,
  scene: { background: "#1d2026" },
  orbit: { button: 2, distance: 9, pitch: -0.5 },
});
game.scene.lights = [
  new HemisphereLight("#9db4ff", "#3b3127", 0.35),
  new DirectionalLight({ x: -0.4, y: -1, z: 0.3 }, 0.7, { castShadow: true }),
];
game.add(new Ground({ style: "plane", size: 10, color: "#4b4f58", opacity: 1 }));
game.add(new Player({ x: 0, y: 0.25, z: 0 }));
game.add(new CrateSpawner());
game.start();

// "First-person games"
const walker = new Simulation({
  canvas: document.querySelector("canvas")!,
  firstPerson: { sensitivity: 0.003 },
  keyboard: { preventDefault: ["Space"] },
  scene: { background: "#8fbcf0", fog: { color: "#8fbcf0", near: 20, far: 48, mode: "distance" } },
});
const look = walker.firstPerson!;
look.onButton = (button, down) => {
  if (down) console.log(button === 0 ? "break" : "place");
};
walker.onUpdate((dt) => {
  const keys = walker.keyboard!;
  const ahead = keys.axis("KeyS", "KeyW");
  const aside = keys.axis("KeyA", "KeyD");
  const f = look.forward({ x: 0, y: 0, z: 0 });
  const r = look.right({ x: 0, y: 0, z: 0 });
  walker.camera.position.x += (f.x * ahead + r.x * aside) * 4 * dt;
  walker.camera.position.z += (f.z * ahead + r.z * aside) * 4 * dt;
  if (keys.wasPressed("KeyF")) walker.paused = !walker.paused;
});

/** Unit blocks wherever `solid` says: rigid bodies land on them like on the built-in colliders. */
class Blocks implements Collider {
  constructor(private readonly solid: (x: number, y: number, z: number) => boolean) {}

  update(): void {}
  solve(): void {} // particles pass through these blocks

  rigidShapes(x: number, y: number, z: number, r: number, out: StaticShapeSink): void {
    for (let by = Math.floor(y - r); by <= Math.floor(y + r); by++) {
      for (let bz = Math.floor(z - r); bz <= Math.floor(z + r); bz++) {
        for (let bx = Math.floor(x - r); bx <= Math.floor(x + r); bx++) {
          if (this.solid(bx, by, bz)) out.box(bx + 0.5, by + 0.5, bz + 0.5, 0.5, 0.5, 0.5);
        }
      }
    }
  }
}
walker.world.addCollider(new Blocks((_x, y) => y < 0));

// "Running in a worker"
const view = document.querySelector("canvas")!;
const offscreen = view.transferControlToOffscreen();
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
worker.postMessage({ canvas: offscreen, width: view.clientWidth, height: view.clientHeight, pixelRatio: devicePixelRatio }, [offscreen]);
new ResizeObserver(() => worker.postMessage({ width: view.clientWidth, height: view.clientHeight })).observe(view);

let offscreenBackend: Canvas2DBackend | null = null;
self.onmessage = (e: MessageEvent<{ canvas?: OffscreenCanvas; width: number; height: number; pixelRatio?: number }>) => {
  const { canvas, width, height, pixelRatio } = e.data;
  if (!canvas) {
    offscreenBackend?.setSize(width, height);
    return;
  }
  offscreenBackend = new Canvas2DBackend(canvas, { width, height, pixelRatio });
  const inWorker = new Simulation({ backend: offscreenBackend, orbit: { distance: 4, pitch: -0.3 } });
  inWorker.add(new RigidBox(0.4, { position: { x: 0, y: 2, z: 0 } }));
  inWorker.start();
};
