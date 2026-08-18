// collision.ts
import Circle from "../objects/circle.js";
import { Cube } from "../objects/cube.js";
import { Vec } from "../objects/vectors.js";
import { Vec3 } from "../rendering/renderer.js";
import { SpatialGrid } from "../utility/partitioning.js";

export class CollisionSystem {

  static resolveCircleCube(
    circle: Circle,
    cube: Cube,
    axis: { x: Vec3; y: Vec3; z: Vec3 },
    restitution: number = 1,
  ): void {
    const coll = cube.checkCircleCubeCollision(circle);
    const v = circle.velocity;
    const k = 1 + restitution;

    if (coll.x) {
      const dot = Vec.dot(v, axis.x);
      v.x -= k * dot * axis.x.x;
      v.y -= k * dot * axis.x.y;
      v.z -= k * dot * axis.x.z;
    }
    if (coll.y) {
      const dot = Vec.dot(v, axis.y);
      v.x -= k * dot * axis.y.x;
      v.y -= k * dot * axis.y.y;
      v.z -= k * dot * axis.y.z;
    }
    if (coll.z) {
      const dot = Vec.dot(v, axis.z);
      v.x -= k * dot * axis.z.x;
      v.y -= k * dot * axis.z.y;
      v.z -= k * dot * axis.z.z;
    }
  }

  static resolveCircleCircle(circle: Circle, others: Circle[]): void {
    for (const other of others) {
      if (other === circle) continue;
      if (!circle.isTouchingCircle(other)) continue;

      const toOther = Vec.subtractVectors(other.center, circle.center);

      if (Vec.dot(circle.velocity, toOther) > 0) {
        circle.velocity.x *= -1;
        circle.velocity.y *= -1;
        circle.velocity.z *= -1;
      }

      const dist = Vec.distanceTo(circle.center, other.center);
      const overlap = circle.baseRadius + other.baseRadius - dist;

      if (overlap > 0) {
        const n = Vec.getNormalvector(toOther);
        circle.translate({
          x: -n.x * overlap / 2,
          y: -n.y * overlap / 2,
          z: -n.z * overlap / 2,
        });
      }
    }
  }

  static resolveAll(
    circles: Circle[],
    cube: Cube,
    grid: SpatialGrid,
    restitution: number = 1,
  ): void {
    const axis = cube.axis;

    grid.clear();
    for (const c of circles) grid.insert(c);

    for (const circle of circles) {
      CollisionSystem.resolveCircleCube(circle, cube, axis, restitution);
      CollisionSystem.resolveCircleCircle(circle, grid.getNearby(circle));
    }
  }
}