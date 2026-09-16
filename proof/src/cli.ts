// `proof test [filter] [--verbose]` — runs the Java game tests and reports them.
// `proof install <world>` — writes the same pack into a save, to play with it by hand.
import path from "path";
import type { Datapack } from "helix";
import { runTests } from "./gametest";

/** The pack under test, anchored to the package: the CLI is meant to run from anywhere. */
async function testPack(): Promise<Datapack> {
  const mod = (await import(path.resolve(__dirname, "../tests/pack.ts"))) as { dp: Datapack };
  return mod.dp;
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "install") {
    const world = rest[0];
    if (!world) {
      console.error("usage: proof install <world-folder>");
      process.exit(2);
    }
    const out = path.join(world, "datapacks", "proof");
    (await testPack()).writeDatapack(out);
    console.log(`wrote ${out}\nin game: /reload, then /function proof:golem/summon`);
    return;
  }
  if (command !== "test") {
    console.error("usage: proof test [filter] [--verbose] | proof install <world-folder>");
    process.exit(2);
  }

  const verbose = rest.includes("--verbose");
  const filter = rest.find((a) => !a.startsWith("--"));
  const results = await runTests(await testPack(), { filter, verbose });

  for (const r of results) {
    const detail = r.failure ?? r.skipped;
    // The runner reports an optional test's failure as skipped; XFAIL says that plainly.
    const mark = r.failure ? "FAIL " : r.skipped ? "XFAIL" : "PASS ";
    console.log(`${mark} ${r.name}  ${r.time.toFixed(2)}s`);
    if (detail) console.log(`     ${detail}`);
  }
  const failed = results.filter((r) => r.failure).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
