import { describe, expect, it } from "vitest";
import budgets from "../../perf/budgets.json";
import { count, type Counters } from "../../perf/harness.js";
import { scenarios } from "../../perf/scenarios/index.js";

/**
 * Work budgets for the demos, recorded by `npm run perf:baseline`. The counters are deterministic, so
 * unlike timings they can be checked on any machine: a change that makes a demo draw more batches,
 * submit more primitives or test more pairs than before fails here.
 */
const GROWTH = 1.1;
const recorded = budgets.scenarios as Record<string, Counters>;

describe("demo budgets", () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const base = recorded[scenario.name];
      expect(base, `no budget for ${scenario.name}: run npm run perf:baseline`).toBeDefined();
      const now = count(scenario, budgets.frames);
      expect(now.finite).toBe(true);
      expect(now.bodies).toBe(base.bodies);
      for (const key of ["primitives", "batches", "beginPaths", "pathCommands", "pairs", "candidateTests"] as const) {
        expect(now[key], key).toBeLessThanOrEqual(Math.ceil(base[key] * GROWTH));
        // Far fewer than before means something stopped being simulated or drawn
        expect(now[key], key).toBeGreaterThanOrEqual(Math.floor(base[key] * 0.5));
      }
    });
  }
});
