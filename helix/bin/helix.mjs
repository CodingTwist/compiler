#!/usr/bin/env node
// helix CLI - see src/cli/run.ts. The command runs inside tsx (its CLI installs both the
// CJS and ESM hooks), so helix.config.ts and the pack entry load straight from source.
// `dev` is `build` under `tsx watch`, which re-runs on any file the pack imports.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args[0] === "data") {
  // Handled here, before dist is imported: importing helix loads every version profile,
  // which throws while the (unshipped) data is missing.
  const root = fileURLToPath(new URL("..", import.meta.url));
  const run = (script, extra = []) =>
    spawnSync(process.execPath, [`scripts/${script}`, ...extra], { cwd: root, stdio: "inherit" }).status;
  process.exitCode = run("versions.mjs", ["sync", ...args.slice(1)]) || run("copy-data.mjs");
} else if (process.env.HELIX_CLI_CHILD) {
  const { runCli } = await import("../dist/cli/run.js");
  process.exitCode = await runCli(args);
} else {
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  const self = fileURLToPath(import.meta.url);
  const argv = args[0] === "dev"
    ? [tsx, "watch", "--clear-screen=false", self, "build", ...args.slice(1)]
    : [tsx, self, ...args];
  const child = spawn(process.execPath, argv, {
    stdio: "inherit",
    env: { ...process.env, HELIX_CLI_CHILD: "1" },
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
