// Shapes of the helix-profiler dump and of the report matched against this pack.
import type { SourceLoc } from "../../debug/sources";

/** One attributed command: its function stack (outermost first) and the command text. */
export interface ProfileDumpFrame {
  stack: string[];
  /** The command last started in that function, `""` before its first command. */
  command: string;
  /** Queue entries charged here (a command, or the call/fork steps it queued). */
  entries: number;
  selfNs: number;
}

export interface ProfileDumpCall {
  stack: string[];
  count: number;
}

export interface ProfileDumpSpan {
  calls: ProfileDumpCall[];
  frames: ProfileDumpFrame[];
}

/** The mod's `/helixprof stop` output. */
export interface ProfileDump extends ProfileDumpSpan {
  version: 1;
  mc: string;
  /** Server ticks the session spanned. */
  ticks: number;
  wallNs: number;
  /** The tick whose function work took longest. */
  worstTick: ProfileDumpSpan & { index: number; ns: number };
}

export interface ProfiledFunction {
  /** Bare name for this pack's functions (as in `dp.files`), else the full id. */
  fn: string;
  calls: number;
  /** Time in the function's own commands. */
  selfNs: number;
  /** Self plus everything it called. */
  totalNs: number;
  /** Static command lines in the rendered function, when it's this pack's. */
  commands?: number;
}

export interface ProfiledCommand {
  fn: string;
  command: string;
  selfNs: number;
  entries: number;
  /** 1-based line in the `.mcfunction`, when the command text was found there. */
  line?: number;
  /** The TS line that emitted it, with `debug.sources` on. */
  source?: SourceLoc;
}

export interface ProfileSpanReport {
  totalNs: number;
  /** Heaviest `totalNs` first. */
  functions: ProfiledFunction[];
  /** Heaviest `selfNs` first. */
  commands: ProfiledCommand[];
}

export interface ProfileReport extends ProfileSpanReport {
  mc: string;
  ticks: number;
  wallNs: number;
  /** Static worst-case commands/tick from `analyzeCost`, for comparison. */
  worstCaseCommandsPerTick: number;
  worstTick: ProfileSpanReport & { index: number; ns: number };
}
