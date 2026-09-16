// `proof test [filter] [--verbose]` — runs the Java game tests and reports them.
import path from "path";
import type { Datapack } from "helix";
import { runTests } from "./gametest";

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command !== "test") {
    console.error("usage: proof test [filter] [--verbose]");
    process.exit(2);
  }

  const verbose = rest.includes("--verbose");
  const filter = rest.find((a) => !a.startsWith("--"));
  const pack = (await import(path.resolve("tests/pack.ts"))) as { dp: Datapack };
  const results = await runTests(pack.dp, { filter, verbose });

  for (const r of results) {
    const detail = r.failure ?? r.skipped;
    console.log(`${r.failure ? "FAIL" : r.skipped ? "SKIP" : "PASS"} ${r.name}  ${r.time.toFixed(2)}s`);
    if (detail) console.log(`     ${detail}`);
  }
  const failed = results.filter((r) => r.failure).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
