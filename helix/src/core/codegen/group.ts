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
  // Allowed functions keep their layout so the allow still matches.
  const allowed = new Set([...dp.allowed.values()].flatMap((fns) => [...fns.keys()]));
  const effectOf = effects(dp);

  const queue = [...dp.files.keys()];
  // Group files are queued too, so a group can hold a smaller group.
  for (const name of queue) {
    const infos = dp.lineInfo.get(name);
    if (allowed.has(name) || !infos) continue;
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
    for (const run of findRuns(lines)) {
      for (const part of splitAtBlockers(run, effectOf)) {
        out.push(...(worthGrouping(part) ? call(part) : part.lines));
      }
    }
    if (out.length === lines.length && out.every((l, i) => l === lines[i])) continue;
    dp.files.set(name, out.map((l) => l.text).join("\n"));
    dp.lineInfo.set(name, out.map((l) => l.info));
    if (sources) dp.sourceMap.set(name, out.map((l) => l.source));
  }
}

/** Clauses `line` may share: none once it holds a `return`, which would exit the group instead. */
const shareable = (line: Line): SharedClause[] => (line.info.exits ? [] : line.info.clauses);

/** Splits `lines` into runs; a line that shares nothing is a run of its own. */
function findRuns(lines: Line[]): Run[] {
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
    const shared = commonPrefix(run.shared, shareable(line));
    if (run.lines.length && shared.length) {
      run.lines.push(...pending, line);
      run.shared = shared;
      pending = [];
    } else {
      close();
      run = { lines: [line], shared: shareable(line) };
    }
  }
  close();
  return runs;
}

/** Splits `run` after each line that could change what its shared clauses pick. */
function splitAtBlockers(run: Run, effectOf: (info: LineInfo) => Effect): Run[] {
  const self = run.shared.some((c) => c.kind === "self");
  const other = run.shared.some((c) => c.kind === "other");
  const lastCommand = run.lines.filter((l) => !l.info.comment).at(-1);

  const parts: Run[] = [];
  let part: Line[] = [];
  for (const line of run.lines) {
    part.push(line);
    // Nothing re-reads the prefix after the last line, so it may do anything.
    if (line.info.comment || line === lastCommand) continue;
    const effect = effectOf(line.info);
    // A selector may pick another entity after any change; `@s` only moves with its entity.
    if ((other && effect !== Effect.NONE) || (self && effect === Effect.MOVES)) {
      parts.push({ lines: part, shared: run.shared });
      part = [];
    }
  }
  if (part.length) parts.push({ lines: part, shared: run.shared });
  return parts;
}

/** Whether a call saves work: it costs one command, and a scanning selector costs more. */
function worthGrouping(part: Run): boolean {
  if (!part.shared.length) return false;
  const commands = part.lines.filter((l) => !l.info.comment).length;
  return commands >= (part.shared.some((c) => c.scans) ? 2 : 3);
}

/** Returns what a line can do to entities, including the functions it calls. */
function effects(dp: Datapack): (info: LineInfo) => Effect {
  const memo = new Map<string, Effect>();
  // Depth of each function still being visited, to spot recursion.
  const visiting = new Map<string, number>();

  /** Effect of `name`, and the shallowest visiting function it reached back to. */
  const visit = (name: string): [Effect, number] => {
    const known = memo.get(name);
    if (known) return [known, Infinity];
    const depth = visiting.get(name);
    if (depth !== undefined) return [Effect.NONE, depth];
    const infos = dp.lineInfo.get(name);
    // A call we can't read might do anything.
    if (!infos) return [Effect.MOVES, Infinity];

    const own = visiting.size;
    visiting.set(name, own);
    let effect: Effect = Effect.NONE;
    let low = Infinity;
    for (const info of infos) {
      effect = worst(effect, info.effect);
      for (const callee of info.calls) {
        const [e, l] = visit(callee);
        effect = worst(effect, e);
        low = Math.min(low, l);
      }
    }
    visiting.delete(name);
    // Inside a loop through a caller, the result is missing that caller's effects.
    if (low >= own) memo.set(name, effect);
    return [effect, low];
  };

  return (info) => worst(info.effect, ...info.calls.map((c) => visit(c)[0]));
}

/** The longest run of clauses `a` and `b` both start with. */
function commonPrefix(a: SharedClause[], b: SharedClause[]): SharedClause[] {
  let i = 0;
  while (i < a.length && i < b.length && a[i].text === b[i].text) i++;
  return a.slice(0, i);
}
