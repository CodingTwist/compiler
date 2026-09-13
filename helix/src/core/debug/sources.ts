// Debug source tracking: remember which line of the author's TypeScript emitted
// each AST node, so codegen can map every rendered command back to it (report
// warnings, `#` comments, the sidecar map). Off unless a Datapack is built with
// `debug: { sources }` - capturing a stack per node is far too slow to leave on.
//
// Browser-safe: no `fs`/`path`, and `__dirname` / `process` are guarded.
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

// Keyed by the function a node was pushed into: a call node is the callee's own
// shared FunctionNode, so the same node sits at a different line in each caller.
const locs = new WeakMap<FunctionNode, Map<ASTNode, SourceLoc>>();
// helix's own package root first (the fallback skips only these frames).
const helixRoot = typeof __dirname === "string" ? up(__dirname, 3) : undefined;
/** Library roots whose frames are skipped; `framework` ones attribute their own lines. */
const ignored: { root: string; framework: boolean }[] = helixRoot
  ? [{ root: helixRoot, framework: false }]
  : [];
// ponytail: process-wide - once any debug pack exists, later packs capture too
// (CPU only; output stays gated on each pack's own `debug`). Scope per pack if that bites.
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
 * Skip stack frames under `dir` when attributing a node, so locations land in
 * the author's code - for libraries built on helix. A helper library (spool)
 * passes nothing: its lines go to whoever called it. A `framework` (twine) calls
 * *into* author code rather than being called by it, so a line it emits on its
 * own is attributed to the framework frame, not to the outer build entry point
 * (`DatapackFactory.create(...)` in main) that every such line would share.
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

/** Record the author line pushing `node` into `fn`. Called by `FunctionNode.push`. */
export function captureSource(fn: FunctionNode, node: ASTNode): void {
  if (!enabled) return;
  let byNode = locs.get(fn);
  if (!byNode) locs.set(fn, (byNode = new Map()));
  if (byNode.has(node)) return; // the same call twice in one function: first site wins
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50; // twine's tick wiring runs deeper than the default 10
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;

  for (const frame of stack.split("\n").slice(1)) {
    const m = FRAME.exec(frame.trim());
    if (!m || m[1].startsWith("node:") || m[1].includes("/node_modules/")) continue;
    const file = m[1].replace(/\\/g, "/");
    const loc = `${relative(file)}:${m[2]}:${m[3]}`;
    // A test file is always the author, even inside helix's own tree.
    if (/\.test\.[cm]?[jt]s$/.test(file)) return void byNode.set(node, loc);
    const lib = ignored.find((r) => file.startsWith(r.root));
    if (lib && !lib.framework) continue;
    return void byNode.set(node, loc); // the author, or a framework's own line
  }
}

function relative(file: string): string {
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd().replace(/\\/g, "/");
  return cwd && file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file;
}
