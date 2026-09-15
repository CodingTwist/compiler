// Matches the helix-profiler mod's timings to this pack's functions, lines and TS sources.
import type { Datapack } from "../../ir/datapack";
import { analyzeCost, type FunctionCost } from "../cost";
import type {
  ProfileDump,
  ProfileDumpSpan,
  ProfiledCommand,
  ProfiledFunction,
  ProfileReport,
  ProfileSpanReport,
} from "./types";

/**
 * Matches a measured profile to this pack. Needs `dp.files`; use {@link
 * Datapack.profileReport}.
 */
export function analyzeProfile(dp: Datapack, raw: ProfileDump): ProfileReport {
  if (raw.version !== 1)
    throw new Error(`helix profile: unsupported version ${raw.version}`);
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
  const local = (id: string) =>
    id.startsWith(`${dp.name}:`) ? id.slice(dp.name.length + 1) : id;
  const fns = new Map<string, ProfiledFunction>();
  const fnOf = (id: string) => {
    const fn = local(id);
    let f = fns.get(fn);
    if (!f) {
      const commands = costs.get(fn)?.commands;
      fns.set(
        fn,
        (f = {
          fn,
          calls: 0,
          selfNs: 0,
          totalNs: 0,
          ...(commands !== undefined && { commands }),
        }),
      );
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

  for (const c of span.calls)
    if (c.stack.length > 0) fnOf(c.stack[c.stack.length - 1]).calls += c.count;

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
