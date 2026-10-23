import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Runner, TIMINGS, count, measure, type Counters, type Scenario, type Timing, type TimingResult } from "./harness.js";
import { scenarios } from "./scenarios/index.js";

/**
 * Performance guardrail. `npm run perf` times every demo scenario and fails when a median is more than
 * 20% (+ 0.05 ms) slower than perf/baseline.json, or when steady-state allocation grows.
 *
 * `npm run perf:baseline` records scenarios that have no baseline yet (new demos), keeping the existing
 * entries: the guardrail keeps measuring against the implementation they were recorded on. `npm run
 * perf:rebaseline` re-records everything. Both also write the deterministic work counters to
 * perf/budgets.json (checked by tests/budgets in `npm test`).
 */

const FRAMES = 600;
const BUDGET_FRAMES = 120;
const ALLOC_FRAMES = 120;
const TOLERANCE = 1.2;
const SLACK_MS = 0.05;

interface Result extends TimingResult {
  /** Bytes allocated per frame in steady state, from V8's sampling heap profiler. */
  allocKBPerFrame: number;
}

interface Baseline {
  machine: string;
  recorded: string;
  frames: number;
  scenarios: Record<string, Result>;
}

interface Budgets {
  frames: number;
  scenarios: Record<string, Counters>;
}

interface ProfileNode {
  callFrame: { url: string };
  selfSize: number;
  children: ProfileNode[];
}

const baselineFile = new URL("./baseline.json", import.meta.url);
const budgetsFile = new URL("./budgets.json", import.meta.url);
const mode = import.meta.env.MODE;
const updating = mode === "baseline" || mode === "rebaseline";
const machine = `${os.cpus()[0]?.model.trim() ?? "unknown cpu"} · ${os.cpus().length} threads · node ${process.version}`;
const session = new Session();

/** Allocated KB per frame after warm-up, ignoring Node internals (the profiler's own bookkeeping). */
async function allocation(scenario: Scenario): Promise<number> {
  const r = new Runner(scenario);
  r.run(120);
  await session.post("HeapProfiler.startSampling", { samplingInterval: 512 });
  r.run(ALLOC_FRAMES);
  const { profile } = (await session.post("HeapProfiler.stopSampling")) as { profile: { head: ProfileNode } };
  let bytes = 0;
  const walk = (n: ProfileNode): void => {
    if (!n.callFrame.url.startsWith("node:")) bytes += n.selfSize;
    for (const c of n.children) walk(c);
  };
  walk(profile.head);
  return bytes / 1024 / ALLOC_FRAMES;
}

function fmt(t: Timing): string {
  return `${t.median.toFixed(3)} (p95 ${t.p95.toFixed(3)})`;
}

function report(name: string, now: Result, base: Result | undefined): void {
  const rows = TIMINGS.map((k) => {
    const ratio = base ? ` x${(now[k].median / Math.max(base[k].median, 1e-6)).toFixed(2)}` : "";
    return `  ${k.padEnd(10)} ${fmt(now[k]).padEnd(26)}${base ? ` base ${fmt(base[k])}${ratio}` : ""}`;
  });
  const alloc = `  alloc      ${now.allocKBPerFrame.toFixed(2)} KB/frame${base ? ` base ${base.allocKBPerFrame.toFixed(2)}` : ""}`;
  process.stdout.write(`${name}\n${rows.join("\n")}\n${alloc}\n`);
}

function regressions(now: Result, base: Result): string[] {
  const out: string[] = [];
  for (const k of TIMINGS) {
    const limit = base[k].median * TOLERANCE + SLACK_MS;
    if (now[k].median > limit) out.push(`${k} median ${now[k].median.toFixed(3)} ms > ${limit.toFixed(3)} ms`);
  }
  const limit = base.allocKBPerFrame * 1.5 + 1;
  if (now.allocKBPerFrame > limit) out.push(`alloc ${now.allocKBPerFrame.toFixed(2)} KB/frame > ${limit.toFixed(2)}`);
  return out;
}

/** Keeps the better of two runs per metric, so one noisy run doesn't fail the check. */
function best(a: Result, b: Result): Result {
  const out: Result = { ...a, allocKBPerFrame: Math.min(a.allocKBPerFrame, b.allocKBPerFrame) };
  for (const k of TIMINGS) out[k] = a[k].median <= b[k].median ? a[k] : b[k];
  return out;
}

async function run(scenario: Scenario): Promise<Result> {
  return { ...measure(scenario, FRAMES), allocKBPerFrame: await allocation(scenario) };
}

const existing: Baseline | null = existsSync(baselineFile)
  ? (JSON.parse(readFileSync(baselineFile, "utf8")) as Baseline)
  : null;
const existingBudgets: Budgets | null = existsSync(budgetsFile)
  ? (JSON.parse(readFileSync(budgetsFile, "utf8")) as Budgets)
  : null;
const baseline: Baseline | null = updating ? null : existing;
// Adding new scenarios keeps every recorded entry
const keep = mode === "baseline";
const recorded: Baseline = keep && existing ? existing : { machine, recorded: new Date().toISOString(), frames: FRAMES, scenarios: {} };
const budgets: Budgets = keep && existingBudgets ? existingBudgets : { frames: BUDGET_FRAMES, scenarios: {} };

describe("performance", () => {
  beforeAll(() => {
    session.connect();
    if (baseline && baseline.machine !== machine) {
      process.stdout.write(`Baseline was recorded on "${baseline.machine}", this is "${machine}".\n`);
    }
  });
  afterAll(() => session.disconnect());

  for (const scenario of scenarios) {
    it(scenario.name, { timeout: 120_000 }, async () => {
      if (keep && recorded.scenarios[scenario.name] && budgets.scenarios[scenario.name]) return;
      let now = await run(scenario);
      const base = baseline?.scenarios[scenario.name];
      if (base && regressions(now, base).length > 0) now = best(now, await run(scenario));
      report(scenario.name, now, base);

      if (updating) {
        recorded.scenarios[scenario.name] = now;
        budgets.scenarios[scenario.name] = count(scenario, BUDGET_FRAMES);
        return;
      }
      expect(base, `no baseline for ${scenario.name}: run npm run perf:baseline`).toBeDefined();
      expect(regressions(now, base!)).toEqual([]);
    });
  }

  if (updating) {
    it("writes the baseline", () => {
      writeFileSync(baselineFile, JSON.stringify(recorded, null, 2) + "\n");
      writeFileSync(budgetsFile, JSON.stringify(budgets, null, 2) + "\n");
    });
  }
});
