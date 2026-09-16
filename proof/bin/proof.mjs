#!/usr/bin/env node
// The `proof` CLI. Re-runs itself under tsx so `tests/pack.ts` can be imported as source.
import { spawnSync } from "child_process";
import { createRequire } from "module";

if (!process.env.PROOF_CLI_CHILD) {
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  const run = spawnSync(process.execPath, [tsx, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, PROOF_CLI_CHILD: "1" },
  });
  process.exit(run.status ?? 1);
}

const { runCli } = await import("../src/cli.ts");
await runCli(process.argv.slice(2));
