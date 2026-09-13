// Compile-time per-tick cost report. A datapack compiler is uniquely able to walk
// the *static* call graph rooted at the `tick` tag and tell the author, before the
// pack ever loads, how much work runs each tick and where the expensive unbounded
// entity scans live (the #1 source of datapack lag).
//
// The analysis runs over the already-rendered function text in `dp.files` (the same
// output codegen writes to disk): call edges are the emitted `function <ns>:<name>`
// lines, a "command" is any non-blank, non-comment line, and selectors appear in
// their final version-rendered form. This is read-only inspection of output, not
// command authoring, so it is deliberately string-based - it sees exactly what the
// game will run, including inlined `execute … run` branches.
import type { Datapack } from "../ir/datapack";

/** Per-function cost: its own command count and any unbounded `@e` scans it makes. */
export interface FunctionCost {
  name: string;
  /** Non-blank, non-comment command lines in this function (calls included). */
  commands: number;
  /** Rendered selectors in this function that scan all entities (e.g. bare `@e`). */
  unboundedScans: string[];
}

/**
 * Cost attributed to one direct call site in a tick root's body - the subtree
 * reached *through that call*, with each shared function counted once (claimed by
 * the first call site in body order that reaches it). So a root's `selfCommands`
 * plus every breakdown entry's `commands` sums back to its `worstCaseCommands`.
 */
export interface CallSiteCost {
  /** The called function (bare name). */
  callee: string;
  /** The `execute …` guard this call sits behind, or `""` when unconditional. */
  guard: string;
  /** Attributed commands: this callee's subtree, shared functions counted once. */
  commands: number;
  /** Attributed functions in that subtree. */
  functions: number;
}

/** Worst-case reachable cost for one `tick`-tagged root function. */
export interface TickRootCost {
  root: string;
  /** Distinct functions reachable from this root (the root included). */
  reachableFunctions: number;
  /** Sum of every reachable function's own command count. */
  worstCaseCommands: number;
  /** The root function's own command lines (the dispatch/guard lines themselves). */
  selfCommands: number;
  /** Per-direct-call-site cost, sorted heaviest first. Partitions the subtree. */
  breakdown: CallSiteCost[];
  /** True if a call cycle (recursion) was reached - worst case is then a lower bound. */
  recursive: boolean;
}

export interface CostReport {
  tickRoots: TickRootCost[];
  /** Sum of worst-case commands across all tick roots. */
  totalWorstCaseCommandsPerTick: number;
  /** Functions reachable from `tick` that perform an unbounded entity scan. */
  unboundedScanners: FunctionCost[];
  /** Every analysed function by bare name. */
  perFunction: Map<string, FunctionCost>;
  /** Entity/block NBT reads reachable from `tick`, with how often they run. */
  nbtReads: NbtRead[];
  /** The {@link nbtReads} faster than {@link NBT_READ_MIN_PERIOD} that nobody allowed. */
  warnings: NbtRead[];
}

/** One NBT read in a tick-reachable function. */
export interface NbtRead {
  fn: string;
  /** Fastest cadence the function is reached at, in ticks (1 = every tick). */
  period: number;
  line: string;
  /** Why it's fine, when allowed via `dp.allowNbtRead`. */
  allowed?: string;
}

/** Reads at this period or slower (the t5 clock) aren't warned about. */
export const NBT_READ_MIN_PERIOD = 5;

/**
 * Entity/block NBT reads: each one serializes the whole entity (or block entity).
 * `storage` is a plain compound lookup, so it isn't counted.
 */
const NBT_READ = /nbt=|data get (entity|block)|(if|unless) data (entity|block)|from (entity|block)/;

/** A helix clock gate (`timing.phaseGate`): an exact residue, not the `N..` wrap. */
const CLOCK_GATE = /if score t(\d+) clock matches \d+(?![.\d])/g;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

/** A selector narrowed by any of these is treated as bounded (a small scan). */
const BOUNDED_PREDICATES = ["limit=", "type=", "tag=", "name="];

/**
 * Find unbounded `@e` selectors in a single rendered line. `@e` with no `type`,
 * `limit`, `tag` or `name` predicate iterates every loaded entity; `@a/@p/@r/@s`
 * are bounded by the player set and are not flagged.
 */
function unboundedScansIn(line: string): string[] {
  const out: string[] = [];
  // `@e` optionally followed by a `[...]` predicate block.
  const re = /@e(\[[^\]]*\])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const predicates = m[1] ?? "";
    if (!BOUNDED_PREDICATES.some((p) => predicates.includes(p))) {
      out.push(m[0]);
    }
  }
  return out;
}

/** Bare command/call lines of a function (blank lines and `#` comments dropped). */
function commandLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Build the per-function cost map plus the call graph (caller → called function
 * names) from rendered function text. Call edges are the emitted
 * `function <ns>:<name>` tokens - they appear bare or inside an `execute … run`.
 */
function analyseFunctions(dp: Datapack): {
  costs: Map<string, FunctionCost>;
  calls: Map<string, string[]>;
} {
  const costs = new Map<string, FunctionCost>();
  const calls = new Map<string, string[]>();
  const callRe = new RegExp(`function ${dp.name}:([\\w/.\\-]+)`, "g");

  for (const [name, text] of dp.files) {
    const lines = commandLines(text);
    const unboundedScans: string[] = [];
    const callees: string[] = [];
    for (const line of lines) {
      unboundedScans.push(...unboundedScansIn(line));
      let m: RegExpExecArray | null;
      callRe.lastIndex = 0;
      while ((m = callRe.exec(line)) !== null) callees.push(m[1]);
    }
    costs.set(name, { name, commands: lines.length, unboundedScans });
    calls.set(name, callees);
  }
  return { costs, calls };
}

/**
 * Direct `function <ns>:<name>` call sites in a function's body, in body order,
 * each paired with the `execute …` guard it sits behind (`""` when unconditional).
 * One entry per line; the guard is the line text before the call with the leading
 * `execute` and trailing `run` stripped.
 */
function directCallSites(
  text: string,
  dpName: string,
): { callee: string; guard: string }[] {
  const out: { callee: string; guard: string }[] = [];
  const callRe = new RegExp(`function ${dpName}:([\\w/.\\-]+)`);
  for (const line of commandLines(text)) {
    const m = callRe.exec(line);
    if (!m) continue;
    const guard = line
      .slice(0, m.index)
      .replace(/^execute\s+/, "")
      .replace(/\s*run\s*$/, "")
      .trim();
    out.push({ callee: m[1], guard });
  }
  return out;
}

/**
 * Walk the subtree rooted at `start`, counting each not-yet-`claimed` function
 * once (and marking it claimed). Returns the newly-attributed command/function
 * totals, so successive calls over one root's call sites partition its subtree.
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

/**
 * Static per-tick cost analysis. Requires `dp.files` to be populated; callers go
 * through {@link Datapack.report}, which runs codegen first.
 */
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

    // Partition the subtree across the root's direct call sites (body order, so a
    // shared function is attributed to whichever call site reaches it first). The
    // root's own lines stay as `selfCommands`; the rest sums across the breakdown.
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

  // Cadence: walk from the roots carrying a period, raised by every clock gate a
  // call sits behind. A function keeps the fastest period it is reached at.
  // An allow covers everything the allowed function calls (its `execute … run`
  // bodies included), unless that callee is also reached some other, faster way.
  const period = new Map<string, number>();
  const allowedBy = new Map<string, string | undefined>();
  const work: [string, number, string | undefined][] = tickRoots.map((r) => [r, 1, undefined]);
  while (work.length > 0) {
    const [name, p, inherited] = work.pop()!;
    const allowed = dp.nbtReadAllowed.get(name) ?? inherited;
    const seen = period.get(name);
    // Revisit only for a faster period, or the same one without an allow.
    if (seen !== undefined && (seen < p || (seen === p && (!allowedBy.get(name) || allowed)))) continue;
    period.set(name, p);
    allowedBy.set(name, allowed);
    for (const { callee, guard } of directCallSites(dp.files.get(name) ?? "", dp.name)) {
      const gated = [...guard.matchAll(CLOCK_GATE)].reduce((acc, m) => lcm(acc, Number(m[1])), p);
      work.push([callee, gated, allowed]);
    }
  }
  const nbtReads: NbtRead[] = [];
  for (const [fn, p] of [...period].sort(([a], [b]) => a.localeCompare(b))) {
    for (const line of commandLines(dp.files.get(fn) ?? "")) {
      if (!NBT_READ.test(line)) continue;
      // A gate on the read's own line (`execute if score t20 … run data get …`) counts too.
      const lp = [...line.matchAll(CLOCK_GATE)].reduce((acc, m) => lcm(acc, Number(m[1])), p);
      nbtReads.push({ fn, period: lp, line, allowed: allowedBy.get(fn) });
    }
  }

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
    warnings: nbtReads.filter((r) => r.period < NBT_READ_MIN_PERIOD && !r.allowed),
  };
}

/** Human-readable summary of a {@link CostReport} for printing to a terminal. */
export function formatCostReport(report: CostReport): string {
  const out: string[] = [];
  out.push("Per-tick cost report");
  out.push(
    `  worst case: ${report.totalWorstCaseCommandsPerTick} commands/tick ` +
      `across ${report.tickRoots.length} tick root(s)`,
  );
  for (const r of report.tickRoots) {
    out.push(
      `    ${r.root}: ${r.worstCaseCommands} cmds, ` +
        `${r.reachableFunctions} fn(s)${r.recursive ? " (recursive - lower bound)" : ""}`,
    );
    // Per-call-site breakdown: where the root's budget goes, and the guard each
    // subtree sits behind. Skipped when the root is a single flat body.
    if (r.breakdown.length > 0) {
      if (r.selfCommands > 0) out.push(`      · self: ${r.selfCommands} cmds`);
      for (const c of r.breakdown) {
        const guard = c.guard ? `  ⟵ ${c.guard}` : "";
        out.push(
          `      · ${c.callee}: ${c.commands} cmds, ${c.functions} fn(s)${guard}`,
        );
      }
    }
  }
  if (report.unboundedScanners.length === 0) {
    out.push("  no unbounded @e scans reachable from tick ✓");
  } else {
    out.push(
      `  ${report.unboundedScanners.length} function(s) with unbounded @e scans:`,
    );
    for (const fn of report.unboundedScanners) {
      out.push(`    ${fn.name}: ${fn.unboundedScans.join(", ")}`);
    }
  }
  for (const w of report.warnings) {
    const line = w.line.length > 120 ? `${w.line.slice(0, 117)}...` : w.line;
    out.push(
      `  WARN nbt read every ${w.period} tick(s) in ${w.fn}: ${line}\n` +
        `       → move it to a t5/t10/t20 clock, or dp.allowNbtRead("${w.fn}", why)`,
    );
  }
  const allowed = report.nbtReads.filter((r) => r.allowed && r.period < NBT_READ_MIN_PERIOD);
  if (allowed.length > 0) {
    const why = [...new Set(allowed.map((r) => `${r.fn} (${r.allowed})`))];
    out.push(`  ${allowed.length} allowed fast nbt read(s): ${why.join(", ")}`);
  }
  return out.join("\n");
}
