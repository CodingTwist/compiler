// Measured profile report: the runtime counterpart to cost-report's static worst case.
// The helix-profiler Fabric mod (sibling `helix-profiler/`) times every command queue
// entry in game and writes raw JSON keyed by function id + command text. Everything
// helix-aware happens here: mapping ids back to this pack's functions, command text
// back to file lines and (with `debug.sources`) the TS line that emitted them, and
// lining the measurements up with the static cost numbers.
//
// Browser-safe: takes the already-parsed JSON, never reads the file itself.
import type { Datapack } from "../ir/datapack";
import type { SourceLoc } from "../debug/sources";
import { analyzeCost, type FunctionCost } from "./cost-report";

/** One attributed command: its function stack (outermost first) and the command text. */
export interface ProfileDumpFrame {
  stack: string[];
  /** The command last started in that function, `""` before its first command. */
  command: string;
  /** Queue entries charged here (a command, or the call/fork steps it queued). */
  entries: number;
  selfNs: number;
}

export interface ProfileDumpCall {
  stack: string[];
  count: number;
}

export interface ProfileDumpSpan {
  calls: ProfileDumpCall[];
  frames: ProfileDumpFrame[];
}

/** The mod's `/helixprof stop` output. */
export interface ProfileDump extends ProfileDumpSpan {
  version: 1;
  mc: string;
  /** Server ticks the session spanned. */
  ticks: number;
  wallNs: number;
  /** The tick whose function work took longest. */
  worstTick: ProfileDumpSpan & { index: number; ns: number };
}

export interface ProfiledFunction {
  /** Bare name for this pack's functions (as in `dp.files`), else the full id. */
  fn: string;
  calls: number;
  /** Time in the function's own commands. */
  selfNs: number;
  /** Self plus everything it called. */
  totalNs: number;
  /** Static command lines in the rendered function, when it's this pack's. */
  commands?: number;
}

export interface ProfiledCommand {
  fn: string;
  command: string;
  selfNs: number;
  entries: number;
  /** 1-based line in the `.mcfunction`, when the command text was found there. */
  line?: number;
  /** The TS line that emitted it, with `debug.sources` on. */
  source?: SourceLoc;
}

export interface ProfileSpanReport {
  totalNs: number;
  /** Heaviest `totalNs` first. */
  functions: ProfiledFunction[];
  /** Heaviest `selfNs` first. */
  commands: ProfiledCommand[];
}

export interface ProfileReport extends ProfileSpanReport {
  mc: string;
  ticks: number;
  wallNs: number;
  /** Static worst-case commands/tick from {@link analyzeCost}, for comparison. */
  worstCaseCommandsPerTick: number;
  worstTick: ProfileSpanReport & { index: number; ns: number };
}

/**
 * Line up a measured profile with this pack. Requires `dp.files` to be populated;
 * callers go through {@link Datapack.profileReport}, which runs codegen first.
 */
export function analyzeProfile(dp: Datapack, raw: ProfileDump): ProfileReport {
  if (raw.version !== 1) throw new Error(`helix profile: unsupported version ${raw.version}`);
  const cost = analyzeCost(dp);
  return {
    mc: raw.mc,
    ticks: raw.ticks,
    wallNs: raw.wallNs,
    worstCaseCommandsPerTick: cost.totalWorstCaseCommandsPerTick,
    ...analyzeSpan(dp, raw, cost.perFunction),
    worstTick: {
      index: raw.worstTick.index,
      ns: raw.worstTick.ns,
      ...analyzeSpan(dp, raw.worstTick, cost.perFunction),
    },
  };
}

function analyzeSpan(
  dp: Datapack,
  span: ProfileDumpSpan,
  costs: Map<string, FunctionCost>,
): ProfileSpanReport {
  const local = (id: string) => (id.startsWith(`${dp.name}:`) ? id.slice(dp.name.length + 1) : id);
  const fns = new Map<string, ProfiledFunction>();
  const fnOf = (id: string) => {
    const fn = local(id);
    let f = fns.get(fn);
    if (!f) {
      const commands = costs.get(fn)?.commands;
      fns.set(fn, (f = { fn, calls: 0, selfNs: 0, totalNs: 0, ...(commands !== undefined && { commands }) }));
    }
    return f;
  };
  const lineIndexes = new Map<string, Map<string, number>>();
  const lineOf = (fn: string, command: string) => {
    const text = dp.files.get(fn);
    if (text === undefined) return undefined;
    let idx = lineIndexes.get(fn);
    if (!idx) lineIndexes.set(fn, (idx = lineIndex(text)));
    return idx.get(command.trim());
  };

  for (const c of span.calls) if (c.stack.length > 0) fnOf(c.stack[c.stack.length - 1]).calls += c.count;

  const commands = new Map<string, ProfiledCommand>();
  let totalNs = 0;
  for (const frame of span.frames) {
    totalNs += frame.selfNs;
    if (frame.stack.length === 0) continue; // a chat/console command outside any function
    const leaf = frame.stack[frame.stack.length - 1];
    fnOf(leaf).selfNs += frame.selfNs;
    // Once per distinct function, so recursion isn't double counted.
    for (const id of new Set(frame.stack)) fnOf(id).totalNs += frame.selfNs;

    const fn = local(leaf);
    const key = `${fn}\n${frame.command}`;
    const existing = commands.get(key);
    if (existing) {
      existing.selfNs += frame.selfNs;
      existing.entries += frame.entries;
      continue;
    }
    const i = frame.command ? lineOf(fn, frame.command) : undefined;
    const source = i === undefined ? undefined : dp.sourceMap.get(fn)?.[i];
    commands.set(key, {
      fn,
      command: frame.command,
      selfNs: frame.selfNs,
      entries: frame.entries,
      ...(i !== undefined && { line: i + 1 }),
      ...(source && { source }),
    });
  }

  return {
    totalNs,
    functions: [...fns.values()].sort((a, b) => b.totalNs - a.totalNs),
    commands: [...commands.values()].sort((a, b) => b.selfNs - a.selfNs),
  };
}

/** Trimmed command line -> first 0-based line index, per function (comments skipped). */
function lineIndex(text: string): Map<string, number> {
  const out = new Map<string, number>();
  text.split("\n").forEach((l, i) => {
    const line = l.trim();
    if (line && !line.startsWith("#") && !out.has(line)) out.set(line, i);
  });
  return out;
}

/**
 * Flame-graph input in the folded-stack format (`a;b;command selfNs` per line), which
 * speedscope and flamegraph.pl open as-is.
 */
export function toFoldedStacks(raw: ProfileDumpSpan): string {
  return raw.frames
    .filter((f) => f.selfNs > 0)
    .map((f) => [...f.stack, f.command || "(entry)"].map((s) => s.replace(/;/g, ",")).join(";") + ` ${f.selfNs}`)
    .join("\n");
}

const ms = (ns: number) => (ns / 1e6).toFixed(3).padStart(10);
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** Human-readable summary of a {@link ProfileReport} for printing to a terminal. */
export function formatProfileReport(report: ProfileReport, opts: { top?: number } = {}): string {
  const top = opts.top ?? 10;
  const ticks = Math.max(report.ticks, 1);
  const out: string[] = [];
  out.push(`Measured profile (${report.mc})`);
  out.push(
    `  ${report.ticks} ticks over ${(report.wallNs / 1e9).toFixed(1)}s: ` +
      `${(report.totalNs / 1e6).toFixed(3)} ms in commands, ${(report.totalNs / ticks / 1e6).toFixed(3)} ms/tick avg`,
  );
  out.push(`  static worst case: ${report.worstCaseCommandsPerTick} commands/tick`);
  pushSpan(out, report, top, ticks);
  const w = report.worstTick;
  if (w.index >= 0) {
    out.push(`  worst tick #${w.index}: ${(w.ns / 1e6).toFixed(3)} ms`);
    pushSpan(out, w, Math.min(top, 5));
  }
  return out.join("\n");
}

function pushSpan(out: string[], span: ProfileSpanReport, top: number, ticks?: number): void {
  out.push(`    ${"total ms".padStart(10)} ${"self ms".padStart(10)} ${"calls".padStart(8)}${ticks ? " calls/tick" : ""}  function`);
  for (const f of span.functions.slice(0, top)) {
    const perTick = ticks ? (f.calls / ticks).toFixed(2).padStart(11) : "";
    const cmds = f.commands === undefined ? "" : `  (${f.commands} cmds)`;
    out.push(`    ${ms(f.totalNs)} ${ms(f.selfNs)} ${String(f.calls).padStart(8)}${perTick}  ${f.fn}${cmds}`);
  }
  out.push(`    ${"self ms".padStart(10)}  hottest commands`);
  for (const c of span.commands.slice(0, top)) {
    const at = c.line === undefined ? c.fn : `${c.fn}:${c.line}`;
    out.push(`    ${ms(c.selfNs)}  ${at}  ${clip(c.command || "(function entry)")}`);
    if (c.source) out.push(`                ↳ ${c.source}`);
  }
}
