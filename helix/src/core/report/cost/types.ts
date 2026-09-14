import type { SourceLoc } from "../../debug/sources";

/** Per-function cost: its own command count and any unbounded `@e` scans it makes. */
export interface FunctionCost {
  name: string;
  /** Non-blank, non-comment command lines in this function (calls included). */
  commands: number;
  /** Rendered selectors in this function that scan all entities (e.g. bare `@e`). */
  unboundedScans: string[];
  /** The author line behind each of {@link unboundedScans}, with `debug.sources` on. */
  scanSources: (SourceLoc | undefined)[];
}

/**
 * Cost of one direct call site in a tick root, counting each shared function once (first
 * caller wins).
 * A root's `selfCommands` plus its breakdown sums to `worstCaseCommands`.
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
  /** Wiki optimisation lints nobody allowed - see {@link LintRule}. */
  lints: Lint[];
  /** Lints silenced with `dp.allow`, reason attached. */
  allowedLints: Lint[];
  /** `dp.allow` calls naming a function the pack doesn't have (renamed or moved) - they silence nothing. */
  staleAllows: { rule: LintRule; fn: string }[];
}

/** One NBT read in a tick-reachable function. */
export interface NbtRead {
  fn: string;
  /** Fastest cadence the function is reached at, in ticks (1 = every tick). */
  period: number;
  line: string;
  /** Why it's fine, when allowed via `dp.allowNbtRead`. */
  allowed?: string;
  /** A cheaper check for what this read is after, when the line says. */
  hint?: string;
  /** The author line that emitted it, with `debug.sources` on. */
  source?: SourceLoc;
  /** Every path to it passes an `if`/`unless`, so `period` is a ceiling, not a rate. */
  guarded?: boolean;
  /** Identical reads in the same function collapsed into this one. */
  count?: number;
}

export type LintRule =
  | "nbt-read"
  | "nbt-write"
  | "vacuous-execute"
  | "fold-into-selector"
  | "redundant-as"
  | "missing-type"
  | "repeated-selector"
  | "macro-score-set"
  | "poll-trigger"
  | "constant-condition"
  | "group-execute";

export interface Lint {
  rule: LintRule;
  fn: string;
  line: string;
  hint: string;
  /** Fastest cadence in ticks, when the function is reachable from `tick`. */
  period?: number;
  /** Only reached behind an `if`/`unless`: `period` is a ceiling. */
  guarded?: boolean;
  /** Why it's fine, for a lint silenced by `dp.allow`. */
  allowed?: string;
  /** Lines in the function with the same finding, when more than one (`line` is the first). */
  count?: number;
  source?: SourceLoc;
}
