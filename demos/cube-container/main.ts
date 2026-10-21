import { Layer, Mesh, MeshNode, PointerDrag, SphereCloud } from "projector";
import { Cube } from "../../src/objects/cube.js";
import Circle from "../../src/objects/circle.js";
import { CollisionSystem } from "../../src/physics/collision.js";
import { SpatialGrid } from "../../src/utility/partitioning.js";
import { createDemo } from "../shared/setup.js";

const demo = createDemo({
  title: "Cube container",
  help: "Left drag: spin the box · Arrows: move it\nRight drag: orbit · Wheel: zoom",
  background: "#333131",
  orbit: { button: 2, distance: 1.5 },
});

const cubi = new Cube(0.5, { x: 0, y: 0.4, z: 0.2 });

const circles: Array<Circle> = [];
const Radius = 0.003;
const h = cubi.dimension / 2;
const amount = 1000;

for (let i = 0; i < amount; i++) {
  const x = cubi.position.x + (Math.random() * 2 - 1) * (h - Radius);
  const y = cubi.position.y + (Math.random() * 2 - 1) * (h - Radius);
  const z = cubi.position.z + (Math.random() * 2 - 1) * (h - Radius);
  circles[i] = new Circle({ x, y, z }, Radius);
}

const grid = new SpatialGrid(Radius * 2);

// Temporary adapter: copy the old objects into render buffers each frame
const spheres = {
  count: amount,
  pos: new Float32Array(amount * 3),
  radius: new Float32Array(amount).fill(Radius),
};
// prettier-ignore
const cubeEdges = [0, 2, 2, 1, 1, 3, 3, 0, 4, 6, 6, 5, 5, 7, 7, 4, 0, 4, 3, 7, 2, 6, 1, 5];
const boxMesh = new Mesh(new Float32Array(24), [], cubeEdges);

const floor = demo.scene.add(new MeshNode(Mesh.grid(2, 16), { color: "#d618c6", opacity: 0.35 }));
floor.layer = Layer.Background;
demo.scene.add(new SphereCloud(spheres, { color: "rgb(160, 212, 91)" }));
demo.scene.add(new MeshNode(boxMesh, { color: "#d618c6", wireframe: true, lineWidth: 2 }));

const sensitivity = 0.01;
new PointerDrag(demo.canvas, (dx, dy) => cubi.rotate({ x: -dy * sensitivity, y: dx * sensitivity, z: 0 }));

demo.start((dt) => {
  const speed = 0.8 * dt;
  const k = demo.keyboard;
  cubi.translate({ x: k.axis("ArrowLeft", "ArrowRight") * speed, y: k.axis("ArrowDown", "ArrowUp") * speed, z: 0 });

  for (const c of circles) {
    c.applyForce({ x: 0, y: -9.8 * c.mass, z: 0 });
    c.integrate(dt);
  }
  CollisionSystem.resolveAll(circles, cubi, grid, 0.3);

  for (let i = 0; i < amount; i++) {
    const c = circles[i].center;
    spheres.pos[i * 3] = c.x;
    spheres.pos[i * 3 + 1] = c.y;
    spheres.pos[i * 3 + 2] = c.z;
  }
  const pts = cubi.points;
  for (let i = 0; i < 8; i++) boxMesh.setVertex(i, pts[i].x, pts[i].y, pts[i].z);

  demo.hud.stat("spheres", amount);
});
