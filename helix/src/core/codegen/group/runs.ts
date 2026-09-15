// Finds runs of lines sharing `execute` clauses, and where they must split.
import { Effect, type SharedClause } from "../../ir/line-info";
import type { Line, Run } from "./types";
import type { ReachOf } from "./reach";

/**
 * Clauses `line` may share: none once it holds a `return`, which would exit the group
 * instead, and none from a forking clause on unless it's local.
 */
function shareable(line: Line, reachOf: ReachOf): SharedClause[] {
  if (line.info.exits) return [];
  const fork = line.info.clauses.findIndex((c) => c.forks);
  return fork < 0 || reachOf(line.info).local
    ? line.info.clauses
    : line.info.clauses.slice(0, fork);
}

/** Splits `lines` into runs; a line that shares nothing is a run of its own. */
export function findRuns(lines: Line[], reachOf: ReachOf): Run[] {
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
export function splitAtBlockers(run: Run, reachOf: ReachOf): Run[] {
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
    if (
      (other && effect !== Effect.NONE) ||
      (self && effect === Effect.MOVES)
    ) {
      parts.push({ lines: part, shared: run.shared });
      part = [];
    }
  }
  if (part.length) parts.push({ lines: part, shared: run.shared });
  return parts;
}

/** Whether a call saves work: it costs one command, and a scan or fork costs more. */
export function worthGrouping(part: Run): boolean {
  if (!part.shared.length) return false;
  const commands = part.lines.filter((l) => !l.info.comment).length;
  return commands >= (part.shared.some((c) => c.scans || c.forks) ? 2 : 3);
}

/** The longest run of clauses `a` and `b` both start with. */
function commonPrefix(a: SharedClause[], b: SharedClause[]): SharedClause[] {
  let i = 0;
  while (i < a.length && i < b.length && a[i].text === b[i].text) i++;
  return a.slice(0, i);
}
