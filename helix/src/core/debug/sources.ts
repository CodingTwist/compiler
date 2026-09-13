// Debug source tracking: records which author line emitted each node, for reports, `#`
// comments and the source map.
//
// Off unless built with `debug: { sources }`; capturing stacks is slow. Browser-safe.
import type { ASTNode, FunctionNode } from "../ir/node";

/** `path/relative/to/cwd.ts:line:col` - clickable in a terminal or VS Code. */
export type SourceLoc = string;

/** Debug-only build settings. Everything is off by default. */
export interface DebugOptions {
  /** Map each command to the TS line that emitted it: report `↳`s + `helix-sources.json`. */
  sources?: boolean;
  /** Also write `# <file>:<line>` above commands in `.mcfunction` files. Implies `sources`. */
  comments?: boolean;
}

// Keyed by function, since a shared callee node sits at a different line in each caller.
const locs = new WeakMap<FunctionNode, Map<ASTNode, SourceLoc>>();
// helix's own package root first (the fallback skips only these frames).
const helixRoot = typeof __dirname === "string" ? up(__dirname, 3) : undefined;
/** Library roots whose frames are skipped; `framework` ones attribute their own lines. */
const ignored: { root: string; framework: boolean }[] = helixRoot
  ? [{ root: helixRoot, framework: false }]
  : [];
// ponytail: process-wide, so once one debug pack exists later packs capture too (output is
// still
// gated per pack). Scope per pack if that matters.
let enabled = false;

function up(dir: string, levels: number): string {
  const parts = dir.split(/[\\/]/);
  return parts.slice(0, parts.length - levels).join("/") + "/";
}

/** Turn capture on (called by a Datapack built with `debug.sources`/`comments`). */
export function enableSourceTracking(): void {
  enabled = true;
}

/**
 * Skips stack frames under `dir` so locations land in author code.
 *
 * Libraries (spool) pass nothing: lines go to their caller. Frameworks (twine) pass
 * `framework`,
 * so lines they emit themselves point at the framework instead of the shared build entry.
 */
export function ignoreSourceFrames(dir: string, opts: { framework?: boolean } = {}): void {
  const root = dir.replace(/\\/g, "/").replace(/\/?$/, "/");
  if (!ignored.some((r) => r.root === root)) ignored.push({ root, framework: !!opts.framework });
}

/** Where `node` was pushed into `fn`, if tracking was on at the time. */
export function sourceOf(fn: FunctionNode, node: ASTNode): SourceLoc | undefined {
  return locs.get(fn)?.get(node);
}

const FRAME = /\(?(?:file:\/\/)?([^\s()]+):(\d+):(\d+)\)?$/;

// Cache of source-mapped locations per call site. Formatting stacks is expensive, so each
// site is formatted once.
const bySite = new Map<string, SourceLoc | null>();

/** Records the author line pushing `node` into `fn`. Called by `FunctionNode.push`. */
export function captureSource(fn: FunctionNode, node: ASTNode): void {
  if (!enabled) return;
  let byNode = locs.get(fn);
  if (!byNode) locs.set(fn, (byNode = new Map()));
  if (byNode.has(node)) return; // the same call twice in one function: first site wins

  const limit = Error.stackTraceLimit;
  const prepare = Error.prepareStackTrace;
  Error.stackTraceLimit = 50; // twine's tick wiring runs deeper than the default 10
  Error.prepareStackTrace = (_, sites) => sites;
  const sites = new Error().stack as unknown as NodeJS.CallSite[];
  Error.prepareStackTrace = prepare;
  const site = sites.slice(1).find((c) => isAuthor(c.getFileName()));
  const key = site
    ? `${site.getFileName()}:${site.getLineNumber()}:${site.getColumnNumber()}`
    : "";
  let loc = bySite.get(key);
  if (loc === undefined) {
    // Same site, same depth: the string stack lines up 1:1 with `sites`.
    loc = fromStack(new Error().stack ?? "");
    bySite.set(key, loc);
  }
  Error.stackTraceLimit = limit;
  if (loc) byNode.set(node, loc);
}

/** Whether a frame in file `name` counts as the author (vs. a library/runtime frame to skip). */
function isAuthor(name: string | null | undefined): boolean {
  if (!name || name.startsWith("node:") || name.includes("/node_modules/")) return false;
  const file = name.replace(/^file:\/\//, "").replace(/\\/g, "/");
  if (/\.test\.[cm]?[jt]s$/.test(file)) return true; // a test file is always the author
  const lib = ignored.find((r) => file.startsWith(r.root));
  return !lib || lib.framework; // the author, or a framework's own line
}

/** The first author frame's location out of a formatted (source-mapped) stack. */
function fromStack(stack: string): SourceLoc | null {
  for (const frame of stack.split("\n").slice(1)) {
    const m = FRAME.exec(frame.trim());
    if (!m || !isAuthor(m[1])) continue;
    return `${relative(m[1].replace(/\\/g, "/"))}:${m[2]}:${m[3]}`;
  }
  return null;
}

function relative(file: string): string {
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd().replace(/\\/g, "/");
  return cwd && file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file;
}
