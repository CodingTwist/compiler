// Game-test mode: run the Java tests under vanilla's own headless test server.
//
//   const results = await runTests(dp);
//
// The world is created fresh for every run and each test gets its own area, so nothing leaks
// between them. Results come from the runner's JUnit report, not from its log.
import fs from "fs";
import path from "path";
import readline from "readline";
import type { Datapack } from "helix";
import { build, launch } from "./launch";

export interface Result {
  /** Namespaced test id, e.g. `proof:golem_survives`. */
  name: string;
  /** Seconds the test took.  */
  time: number;
  /** The assertion that failed, when it did. */
  failure?: string;
  /** Set when an optional test failed, which does not fail the run. */
  skipped?: string;
}

export interface RunOptions {
  /** Substring of the test name to run. Everything, when absent. */
  filter?: string;
  /** Echo the server log. */
  verbose?: boolean;
}

/** Builds `dp`, runs the Java tests against it and returns what the report says. */
export async function runTests(dp: Datapack, opts: RunOptions = {}): Promise<Result[]> {
  const pack = path.join(build.packs, dp.name);
  fs.rmSync(build.packs, { recursive: true, force: true });
  fs.rmSync(build.report, { force: true });
  dp.writeDatapack(pack);

  const proc = await launch({
    version: dp.version.id,
    packs: build.packs,
    data: path.join(pack, "data"),
    tests: opts.filter ? `proof:*${opts.filter}*` : "proof:*",
    report: build.report,
    verbose: opts.verbose,
  });

  const log: string[] = [];
  for (const stream of [proc.stdout, proc.stderr])
    readline.createInterface({ input: stream! }).on("line", (line) => {
      log.push(line);
      if (opts.verbose) console.log(line);
    });
  await new Promise((resolve) => proc.once("exit", resolve));

  if (!fs.existsSync(build.report))
    throw new Error(`the test server wrote no report:\n${log.slice(-20).join("\n")}`);
  return parseReport(fs.readFileSync(build.report, "utf8"));
}

/** Reads the runner's JUnit-like XML. One writer produces it, so the shape is fixed. */
export function parseReport(xml: string): Result[] {
  const cases = xml.matchAll(/<testcase\b([^>]*?)(\/>|>(.*?)<\/testcase>)/gs);
  return [...cases].map(([, attrs, , body = ""]) => ({
    name: attr(attrs, "name"),
    time: Number(attr(attrs, "time")),
    ...pick(body, "failure"),
    ...pick(body, "skipped"),
  }));
}

// The boundary matters: without it `name` also matches the `classname` attribute.
const attr = (attrs: string, name: string) =>
  attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";

function pick(body: string, tag: "failure" | "skipped"): Partial<Result> {
  const found = body.match(new RegExp(`<${tag}[^>]*message="([^"]*)"`));
  return found ? { [tag]: decode(found[1]) } : {};
}

const decode = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e) =>
    ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e as "lt"],
  );
