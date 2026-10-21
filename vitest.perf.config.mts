import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Timing runs: one worker, files in sequence
export default defineConfig({
  resolve: {
    alias: { projector: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["perf/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    fileParallelism: false,
  },
});
