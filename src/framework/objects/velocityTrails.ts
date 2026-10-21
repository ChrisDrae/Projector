import { Layer, LineSet } from "../../scene/nodes.js";
import { SimObject } from "../simObject.js";
import type { ParticleGroup } from "./particleGroup.js";

export interface VelocityTrailsOptions {
  name?: string;
  /** Seconds of velocity each streak covers: it runs from the body to where it was `length` ago. Default 0.05. */
  length?: number;
  color?: string;
  width?: number;
  opacity?: number;
  /** Default Background, so streaks never cover the particles. */
  layer?: number;
}

/** A motion streak behind every particle of a group (or every body), recomputed from velocities each frame. */
export class VelocityTrails extends SimObject {
  readonly source: ParticleGroup | null;
  readonly node: LineSet;
  length: number;

  constructor(source: ParticleGroup | null, options: VelocityTrailsOptions = {}) {
    super({ name: options.name ?? "trails" });
    this.source = source;
    this.length = options.length ?? 0.05;
    this.node = this.addNode(
      new LineSet(256, {
        color: options.color,
        width: options.width,
        opacity: options.opacity,
        layer: options.layer ?? Layer.Background,
      }),
    );
  }

  override sync(): void {
    const s = this.requireSim.world.bodies;
    const lines = this.node;
    lines.ensureCapacity(s.count);
    const pos = s.pos;
    const vel = s.vel;
    const t = this.length;
    const source = this.source;
    const only = source && source.count !== s.count ? source.group : -1;
    let n = 0;
    for (let i = 0; i < s.count; i++) {
      if (only >= 0 && s.group[i] !== only) continue;
      const o = i * 3;
      lines.setSegment(
        n++,
        pos[o],
        pos[o + 1],
        pos[o + 2],
        pos[o] - vel[o] * t,
        pos[o + 1] - vel[o + 1] * t,
        pos[o + 2] - vel[o + 2] * t,
      );
    }
    lines.count = n;
  }
}
