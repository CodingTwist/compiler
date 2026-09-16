// Live tests share one agent, so every file must run in the same process, in order.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    isolate: false,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
