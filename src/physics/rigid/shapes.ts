import type { Vec3 } from "../../math/vec3.js";

/** Shape codes stored per rigid body. */
export const ShapeType = { Sphere: 0, Box: 1, Capsule: 2 } as const;
export type ShapeType = (typeof ShapeType)[keyof typeof ShapeType];

/**
 * Collision shape of a rigid body, in its local frame and centered on its center of mass. Capsules run
 * along the local y axis: a segment of length 2 * halfHeight swept by a sphere of `radius`.
 */
export type Shape =
  | { type: "sphere"; radius: number }
  | { type: "box"; halfExtents: Vec3 }
  | { type: "capsule"; radius: number; halfHeight: number };

export const Shapes = {
  sphere(radius: number): Shape {
    return { type: "sphere", radius };
  },
  /** A box of full size sx x sy x sz (sy, sz default to sx). */
  box(sx: number, sy: number = sx, sz: number = sx): Shape {
    return { type: "box", halfExtents: { x: sx / 2, y: sy / 2, z: sz / 2 } };
  },
  capsule(radius: number, halfHeight: number): Shape {
    return { type: "capsule", radius, halfHeight };
  },
};

export function shapeVolume(shape: Shape): number {
  switch (shape.type) {
    case "sphere":
      return (4 / 3) * Math.PI * shape.radius ** 3;
    case "box": {
      const h = shape.halfExtents;
      return 8 * h.x * h.y * h.z;
    }
    case "capsule":
      return Math.PI * shape.radius ** 2 * (2 * shape.halfHeight) + (4 / 3) * Math.PI * shape.radius ** 3;
  }
}

/** Radius of the sphere around the center that contains the shape. */
export function boundingRadius(shape: Shape): number {
  switch (shape.type) {
    case "sphere":
      return shape.radius;
    case "box": {
      const h = shape.halfExtents;
      return Math.hypot(h.x, h.y, h.z);
    }
    case "capsule":
      return shape.halfHeight + shape.radius;
  }
}

/** Principal moments of inertia of a solid shape of mass m (about its center, along its local axes). */
export function inertia(shape: Shape, m: number, out: Vec3): Vec3 {
  switch (shape.type) {
    case "sphere": {
      const i = 0.4 * m * shape.radius ** 2;
      out.x = i;
      out.y = i;
      out.z = i;
      return out;
    }
    case "box": {
      const h = shape.halfExtents;
      out.x = (m / 3) * (h.y * h.y + h.z * h.z);
      out.y = (m / 3) * (h.x * h.x + h.z * h.z);
      out.z = (m / 3) * (h.x * h.x + h.y * h.y);
      return out;
    }
    case "capsule": {
      // Mass split between the cylinder and the two hemispheres by volume
      const r = shape.radius;
      const h = shape.halfHeight;
      const vc = Math.PI * r * r * 2 * h;
      const vs = (4 / 3) * Math.PI * r ** 3;
      const mc = (m * vc) / (vc + vs);
      const ms = m - mc;
      const axial = mc * (r * r) / 2 + ms * 0.4 * r * r;
      const across = mc * (h * h / 3 + r * r / 4) + ms * (0.4 * r * r + h * h + 0.75 * h * r);
      out.x = across;
      out.y = axial;
      out.z = across;
      return out;
    }
  }
}
