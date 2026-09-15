import type { Datapack } from "../../ir/datapack";
import { CLOCK_GATE, directCallSites, linePeriod } from "./lines";

/**
 * Finds each function's slowest guaranteed period by walking from the roots through clock
 * gates.
 * An allow covers the allowed function's callees unless they're reached faster elsewhere.
 */
export function cadence(
  dp: Datapack,
  roots: string[],
  allows: Map<string, string> | undefined,
) {
  const period = new Map<string, number>();
  const allowedBy = new Map<string, string | undefined>();
  const work: [string, number, string | undefined][] = roots.map((r) => [
    r,
    1,
    undefined,
  ]);
  while (work.length > 0) {
    const [name, p, inherited] = work.pop()!;
    const allowed = allows?.get(name) ?? inherited;
    const seen = period.get(name);
    // Revisit only for a faster period, or the same one without an allow.
    if (
      seen !== undefined &&
      (seen < p || (seen === p && (!allowedBy.get(name) || allowed)))
    )
      continue;
    period.set(name, p);
    allowedBy.set(name, allowed);
    for (const { callee, guard } of directCallSites(
      dp.files.get(name) ?? "",
      dp.name,
    )) {
      work.push([callee, linePeriod(guard, p), allowed]);
    }
  }
  return { period, allowedBy };
}

/** Tick functions only called behind `if`/`unless`, so they run at most that often. */
export function guardedFns(
  dp: Datapack,
  roots: string[],
  period: Map<string, number>,
): Set<string> {
  const free = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (free.has(name)) continue;
    free.add(name);
    for (const { callee, guard } of directCallSites(
      dp.files.get(name) ?? "",
      dp.name,
    )) {
      if (!/\b(if|unless)\b/.test(guard.replace(CLOCK_GATE, "")))
        stack.push(callee);
    }
  }
  return new Set([...period.keys()].filter((fn) => !free.has(fn)));
}
