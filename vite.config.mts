import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

const demos = ["cube-container", "gravitation", "cloth", "flow-field", "lighting", "rigid-bodies"];

export default defineConfig(({ mode }) => ({
  resolve: {
    // Demos import the library by name, exactly like a consumer would
    alias: { projector: r("./src/index.ts") },
  },
  base: mode === "demos" ? "./" : "/",
  server: {
    watch: {
      // Native file events get dropped on Windows when files change in quick succession
      usePolling: true,
      interval: 100,
      ignored: ["**/node_modules/**", "**/dist/**", "**/dist-demos/**", "**/.git/**"],
    },
  },
  build:
    mode === "demos"
      ? {
          outDir: "dist-demos",
          rolldownOptions: {
            input: Object.fromEntries([
              ["index", r("./index.html")],
              ...demos.map((d) => [d, r(`./demos/${d}/index.html`)]),
            ]),
          },
        }
      : {
          lib: { entry: r("./src/index.ts"), formats: ["es"], fileName: "projector" },
          target: "es2022",
          sourcemap: true,
          minify: false,
          copyPublicDir: false,
        },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));
