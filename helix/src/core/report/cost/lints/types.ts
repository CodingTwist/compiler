import type { LintRule } from "../types";
import type { Sel } from "../selectors";

/** Records one finding on the function being linted. */
export type AddLint = (
  rule: LintRule,
  line: string,
  i: number,
  hint: string,
) => void;

/** One rendered command line, as every rule sees it. */
export interface LineCheck {
  fn: string;
  line: string;
  /** Line index in the file, the one `dp.sourceMap` uses. */
  i: number;
  sels: Sel[];
  /** Fastest cadence, when the function is reachable from `tick`. */
  period: number | undefined;
  add: AddLint;
}

/** What the rules remember while walking one function's lines. */
export interface FnState {
  /** Fake-player scores set to a constant earlier in this function, keyed `holder objective`. */
  known: Map<string, number>;
  /** Consecutive `execute <prefix> run|store` lines sharing a condition-free prefix. */
  group?: { prefix: string; line: string; i: number; count: number };
  /** Narrowed `@e`/`@n` scans by normalised key, for `repeated-selector`. */
  scans: Map<string, { sel: string; line: string; lines: Set<number> }>;
  /** Unbounded scans the cost analysis already lists for this function. */
  unbounded: Set<string>;
}

/** Pack-wide facts the tick rules need. */
export interface PackFacts {
  /** Objective → stat criterion, off the rendered `scoreboard objectives add` lines. */
  criteria: Map<string, string>;
  /** Functions running as each player. */
  perPlayer: Set<string>;
}
