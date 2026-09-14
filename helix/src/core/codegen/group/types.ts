// The lines and runs execute-prefix grouping works on.
import type { SourceLoc } from "../../debug/sources";
import { type LineInfo, type SharedClause } from "../../ir/line-info";

/** One line of a function file. */
export interface Line {
  text: string;
  source: SourceLoc | undefined;
  info: LineInfo;
}

/** Consecutive lines that start with the same clauses. */
export interface Run {
  lines: Line[];
  shared: SharedClause[];
}
