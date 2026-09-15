// Lints from the Minecraft Wiki's "Optimizing a data pack", checked on rendered lines.
// Exact rules (exact.ts) run everywhere; the rest (tick.ts) only on tick-reachable code.
// Silence one with `dp.allow(rule, fn, why)`.
import type { Datapack } from "../../../ir/datapack";
import type { FunctionCost, Lint } from "../types";
import { indexedCommandLines, linePeriod } from "../lines";
import { selectorsIn } from "../selectors";
import { allowLookup, packFacts } from "./context";
import {
  constantCondition,
  flushGroup,
  foldIntoSelector,
  groupExecute,
  macroScoreSet,
  missingType,
  redundantAs,
  vacuousExecute,
} from "./exact";
import { collectScans, nbtWrite, pollTrigger, repeatedSelector } from "./tick";
import type { AddLint, FnState, LineCheck } from "./types";

/** Runs every lint over the pack, splitting findings into open and `dp.allow`-ed. */
export function lint(
  dp: Datapack,
  roots: string[],
  period: Map<string, number>,
  guarded: Set<string>,
  costs: Map<string, FunctionCost>,
): { lints: Lint[]; allowedLints: Lint[] } {
  const allowedFor = allowLookup(dp, roots);
  const facts = packFacts(dp, roots);

  const lints: Lint[] = [];
  const allowedLints: Lint[] = [];
  for (const [fn, text] of [...dp.files].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const p = period.get(fn);
    const add: AddLint = (rule, line, i, hint) => {
      const source = dp.sourceMap.get(fn)?.[i];
      const allowed = allowedFor(rule, fn);
      const l: Lint = {
        rule,
        fn,
        line,
        hint,
        ...(p !== undefined && { period: linePeriod(line, p) }),
        ...(guarded.has(fn) && { guarded: true }),
        ...(allowed && { allowed }),
        ...(source && { source }),
      };
      (allowed ? allowedLints : lints).push(l);
    };
    const state: FnState = {
      known: new Map(),
      scans: new Map(),
      unbounded: new Set(costs.get(fn)?.unboundedScans ?? []),
    };

    // Rule order is the order findings are listed in.
    for (const [line, i] of indexedCommandLines(text)) {
      const c: LineCheck = {
        fn,
        line,
        i,
        sels: selectorsIn(line),
        period: p,
        add,
      };
      constantCondition(c, state);
      groupExecute(c, state);
      vacuousExecute(c);
      foldIntoSelector(c);
      redundantAs(c);
      macroScoreSet(c);
      missingType(c, state);
      if (p === undefined) continue;
      nbtWrite(c);
      collectScans(c, state);
      pollTrigger(c, facts);
    }

    flushGroup(state, add);
    repeatedSelector(state, add);
  }
  return { lints: collapse(lints), allowedLints: collapse(allowedLints) };
}

/** One entry per rule + function + hint (the first line), counting the rest. */
function collapse(lints: Lint[]): Lint[] {
  const out = new Map<string, Lint>();
  for (const l of lints) {
    const key = `${l.rule}|${l.fn}|${l.hint}`;
    const seen = out.get(key);
    if (seen) seen.count = (seen.count ?? 1) + 1;
    else out.set(key, { ...l });
  }
  return [...out.values()];
}
