// Moves runs of lines that share leading `execute` clauses into one call.
import type { Datapack } from "../ir/datapack";
import { privateChild } from "../private-fn";
import type { SourceLoc } from "../debug/sources";
import { functionCall, underClauses, withoutClauses } from "../ir/generate";
import { callLine, chainLine, Effect, worst, type LineInfo, type SharedClause } from "../ir/line-info";

/** One line of a function file. */
interface Line {
  text: string;
  source: SourceLoc | undefined;
  info: LineInfo;
}

/** Consecutive lines that start with the same clauses. */
interface Run {
  lines: Line[];
  shared: SharedClause[];
}

/** Groups repeated `execute` prefixes in every function file of `dp`. */
export function groupExecutePrefixes(dp: Datapack): void {
  // Allowed functions are grouped too: an allow covers what its function calls.
  const reachOf = reaches(dp);

  const queue = [...dp.files.keys()];
  // Group files are queued too, so a group can hold a smaller group.
  for (const name of queue) {
    const infos = dp.lineInfo.get(name);
    if (!infos) continue;
    const text = dp.files.get(name)!;
    const texts = text ? text.split("\n") : [];
    if (texts.length !== infos.length) {
      throw new Error(`Line info for '${name}' has ${infos.length} lines, the file ${texts.length}`);
    }
    const sources = dp.sourceMap.get(name);
    const lines = texts.map((t, i): Line => ({ text: t, source: sources?.[i], info: infos[i] }));

    let n = 0;
    const call = (part: Run): Line[] => {
      const lead = part.lines.findIndex((l) => !l.info.comment);
      const body = part.lines.slice(lead);
      const clauses = part.shared.map((c) => c.text);
      let child: string;
      do child = privateChild(name, `group_${n++}`);
      while (dp.files.has(child) || dp.inlined.has(child));

      dp.files.set(child, body.map((l) => (l.info.comment ? l.text : withoutClauses(l.text, clauses))).join("\n"));
      dp.lineInfo.set(
        child,
        body.map((l) => (l.info.comment ? l.info : { ...l.info, clauses: l.info.clauses.slice(clauses.length) })),
      );
      if (sources) dp.sourceMap.set(child, body.map((l) => l.source));
      queue.push(child);
      const callText = underClauses(clauses, functionCall(dp, child));
      const info = chainLine(part.shared, callLine(child));
      return [...part.lines.slice(0, lead), { text: callText, source: body[0].source, info }];
    };

    const out: Line[] = [];
    for (const run of findRuns(lines, reachOf)) {
      for (const part of splitAtBlockers(run, reachOf)) {
        out.push(...(worthGrouping(part) ? call(part) : part.lines));
      }
    }
    if (out.length === lines.length && out.every((l, i) => l === lines[i])) continue;
    dp.files.set(name, out.map((l) => l.text).join("\n"));
    dp.lineInfo.set(name, out.map((l) => l.info));
    if (sources) dp.sourceMap.set(name, out.map((l) => l.source));
  }
}

/**
 * Clauses `line` may share: none once it holds a `return`, which would exit the group
 * instead, and none from a forking clause on unless it's local.
 */
function shareable(line: Line, reachOf: ReachOf): SharedClause[] {
  if (line.info.exits) return [];
  const fork = line.info.clauses.findIndex((c) => c.forks);
  return fork < 0 || reachOf(line.info).local ? line.info.clauses : line.info.clauses.slice(0, fork);
}

/** Splits `lines` into runs; a line that shares nothing is a run of its own. */
function findRuns(lines: Line[], reachOf: ReachOf): Run[] {
  const runs: Run[] = [];
  let run: Run = { lines: [], shared: [] };
  // Comments after the run's last command, which only join if another command does.
  let pending: Line[] = [];

  const close = () => {
    if (run.lines.length) runs.push(run);
    for (const c of pending) runs.push({ lines: [c], shared: [] });
    run = { lines: [], shared: [] };
    pending = [];
  };

  for (const line of lines) {
    if (line.info.comment) {
      pending.push(line);
      continue;
    }
    const shared = commonPrefix(run.shared, shareable(line, reachOf));
    if (run.lines.length && shared.length) {
      run.lines.push(...pending, line);
      run.shared = shared;
      pending = [];
    } else {
      close();
      run = { lines: [line], shared: shareable(line, reachOf) };
    }
  }
  close();
  return runs;
}

/** Splits `run` after each line that could change what its shared clauses pick. */
function splitAtBlockers(run: Run, reachOf: ReachOf): Run[] {
  const self = run.shared.some((c) => c.kind === "self");
  const other = run.shared.some((c) => c.kind === "other");
  const lastCommand = run.lines.filter((l) => !l.info.comment).at(-1);

  const parts: Run[] = [];
  let part: Line[] = [];
  for (const line of run.lines) {
    part.push(line);
    // Nothing re-reads the prefix after the last line, so it may do anything.
    if (line.info.comment || line === lastCommand) continue;
    const { effect } = reachOf(line.info);
    // A selector may pick another entity after any change; `@s` only moves with its entity.
    if ((other && effect !== Effect.NONE) || (self && effect === Effect.MOVES)) {
      parts.push({ lines: part, shared: run.shared });
      part = [];
    }
  }
  if (part.length) parts.push({ lines: part, shared: run.shared });
  return parts;
}

/** Whether a call saves work: it costs one command, and a scan or fork costs more. */
function worthGrouping(part: Run): boolean {
  if (!part.shared.length) return false;
  const commands = part.lines.filter((l) => !l.info.comment).length;
  return commands >= (part.shared.some((c) => c.scans || c.forks) ? 2 : 3);
}

/** What a line can do to entities, and whether it stays on `@s`, counting what it calls. */
interface Reach {
  effect: Effect;
  local: boolean;
}

type ReachOf = (info: LineInfo) => Reach;

/** Returns the {@link Reach} of a line, following the functions it calls. */
function reaches(dp: Datapack): ReachOf {
  const memo = new Map<string, Reach>();
  // Depth of each function still being visited, to spot recursion.
  const visiting = new Map<string, number>();

  /** Reach of `name`, and the shallowest visiting function it reached back to. */
  const visit = (name: string): [Reach, number] => {
    const known = memo.get(name);
    if (known) return [known, Infinity];
    const depth = visiting.get(name);
    if (depth !== undefined) return [{ effect: Effect.NONE, local: true }, depth];
    const infos = dp.lineInfo.get(name);
    // A call we can't read might do anything.
    if (!infos) return [{ effect: Effect.MOVES, local: false }, Infinity];

    const own = visiting.size;
    visiting.set(name, own);
    let low = Infinity;
    const reach = infos.reduce<Reach>((acc, info) => {
      const [r, l] = combine(info);
      low = Math.min(low, l);
      return { effect: worst(acc.effect, r.effect), local: acc.local && r.local };
    }, { effect: Effect.NONE, local: true });
    visiting.delete(name);
    // Inside a loop through a caller, the result is missing that caller's lines.
    if (low >= own) memo.set(name, reach);
    return [reach, low];
  };

  /** A line's own reach joined with its callees'. */
  const combine = (info: LineInfo): [Reach, number] => {
    let reach: Reach = { effect: info.effect, local: info.local };
    let low = Infinity;
    for (const callee of info.calls) {
      const [r, l] = visit(callee);
      reach = { effect: worst(reach.effect, r.effect), local: reach.local && r.local };
      low = Math.min(low, l);
    }
    return [reach, low];
  };

  return (info) => combine(info)[0];
}

/** The longest run of clauses `a` and `b` both start with. */
function commonPrefix(a: SharedClause[], b: SharedClause[]): SharedClause[] {
  let i = 0;
  while (i < a.length && i < b.length && a[i].text === b[i].text) i++;
  return a.slice(0, i);
}
