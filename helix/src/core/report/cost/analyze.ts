// Static per-tick cost report: how many commands run each tick and where unbounded entity
// scans are.
//
// Reads the rendered function text, so it sees exactly what the game runs, including
// inlined branches.
import type { Datapack } from "../../ir/datapack";
import type { SourceLoc } from "../../debug/sources";
import type { CallSiteCost, CostReport, FunctionCost, NbtRead, TickRootCost } from "./types";
import { directCallSites, indexedCommandLines, linePeriod, unboundedScansIn } from "./lines";
import { NBT_READ, NBT_READ_MIN_PERIOD, collapseReads, nbtReadHint } from "./nbt-reads";
import { cadence, guardedFns } from "./cadence";
import { lint } from "./lints";

/** Per-function costs and the call graph, from rendered text. */
function analyseFunctions(dp: Datapack): {
  costs: Map<string, FunctionCost>;
  calls: Map<string, string[]>;
} {
  const costs = new Map<string, FunctionCost>();
  const calls = new Map<string, string[]>();
  const callRe = new RegExp(`function ${dp.name}:([\\w/.\\-]+)`, "g");

  for (const [name, text] of dp.files) {
    const lines = indexedCommandLines(text);
    const unboundedScans: string[] = [];
    const scanSources: (SourceLoc | undefined)[] = [];
    const callees: string[] = [];
    for (const [line, i] of lines) {
      for (const scan of unboundedScansIn(line)) {
        unboundedScans.push(scan);
        scanSources.push(dp.sourceMap.get(name)?.[i]);
      }
      let m: RegExpExecArray | null;
      callRe.lastIndex = 0;
      while ((m = callRe.exec(line)) !== null) callees.push(m[1]);
    }
    costs.set(name, { name, commands: lines.length, unboundedScans, scanSources });
    calls.set(name, callees);
  }
  return { costs, calls };
}

/**
 * Counts each unclaimed function under `start` once and claims it, so call sites partition
 * a subtree.
 */
function attributeSubtree(
  start: string,
  calls: Map<string, string[]>,
  costs: Map<string, FunctionCost>,
  claimed: Set<string>,
): { commands: number; functions: number } {
  let commands = 0;
  let functions = 0;
  const stack = [start];
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (claimed.has(name)) continue;
    claimed.add(name);
    commands += costs.get(name)?.commands ?? 0;
    functions += 1;
    for (const callee of calls.get(name) ?? []) stack.push(callee);
  }
  return { commands, functions };
}

/** Static per-tick cost analysis. Needs `dp.files`; use {@link Datapack.report}. */
export function analyzeCost(dp: Datapack): CostReport {
  const { costs, calls } = analyseFunctions(dp);
  const tickRoots = [...(dp.tags.get("tick") ?? [])];

  const reachableFromTick = new Set<string>();
  const rootCosts: TickRootCost[] = [];

  for (const root of tickRoots) {
    const reached = new Set<string>();
    let recursive = false;
    const stack = [root];
    while (stack.length > 0) {
      const name = stack.pop()!;
      if (reached.has(name)) {
        recursive = true; // re-entered an already-seen function on this root
        continue;
      }
      reached.add(name);
      for (const callee of calls.get(name) ?? []) stack.push(callee);
    }
    let worstCaseCommands = 0;
    for (const name of reached) {
      reachableFromTick.add(name);
      worstCaseCommands += costs.get(name)?.commands ?? 0;
    }

    // Split the subtree across direct call sites, in body order.
    const selfCommands = costs.get(root)?.commands ?? 0;
    const claimed = new Set<string>([root]);
    const seen = new Set<string>();
    const breakdown: CallSiteCost[] = [];
    for (const { callee, guard } of directCallSites(dp.files.get(root) ?? "", dp.name)) {
      if (seen.has(callee)) continue; // one row per callee; first guard wins
      seen.add(callee);
      const { commands, functions } = attributeSubtree(callee, calls, costs, claimed);
      breakdown.push({ callee, guard, commands, functions });
    }
    breakdown.sort((a, b) => b.commands - a.commands);

    rootCosts.push({
      root,
      reachableFunctions: reached.size,
      worstCaseCommands,
      selfCommands,
      breakdown,
      recursive,
    });
  }

  const { period, allowedBy } = cadence(dp, tickRoots, dp.allowed.get("nbt-read"));
  const guarded = guardedFns(dp, tickRoots, period);
  const nbtReads: NbtRead[] = [];
  for (const [fn, p] of [...period].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [line, i] of indexedCommandLines(dp.files.get(fn) ?? "")) {
      if (!NBT_READ.test(line)) continue;
      const source = dp.sourceMap.get(fn)?.[i];
      const hint = nbtReadHint(line);
      nbtReads.push({
        fn,
        period: linePeriod(line, p),
        line,
        allowed: allowedBy.get(fn),
        ...(guarded.has(fn) && { guarded: true }),
        ...(hint && { hint }),
        ...(source && { source }),
      });
    }
  }

  const { lints, allowedLints } = lint(dp, tickRoots, period, guarded, costs);

  const unboundedScanners: FunctionCost[] = [];
  for (const name of reachableFromTick) {
    const cost = costs.get(name);
    if (cost && cost.unboundedScans.length > 0) unboundedScanners.push(cost);
  }
  unboundedScanners.sort((a, b) => a.name.localeCompare(b.name));

  return {
    tickRoots: rootCosts,
    totalWorstCaseCommandsPerTick: rootCosts.reduce(
      (sum, r) => sum + r.worstCaseCommands,
      0,
    ),
    unboundedScanners,
    perFunction: costs,
    nbtReads,
    warnings: collapseReads(nbtReads.filter((r) => r.period < NBT_READ_MIN_PERIOD && !r.allowed)),
    lints,
    allowedLints,
    staleAllows: [...dp.allowed].flatMap(([rule, fns]) =>
      [...fns.keys()].filter((fn) => !dp.files.has(fn)).map((fn) => ({ rule, fn })),
    ),
  };
}
