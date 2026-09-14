// The public API safe in any runtime. `index.ts` and `browser.ts` both build on it so they
// can't drift.
export { Datapack } from "./core/ir/datapack";
export type { OptimizeOptions } from "./core/ir/datapack-core";
export { type RuntimeTarget } from "./core/ir/target";
export * from "./core/ir/node";
export * from "./core/frontend/";

// Value classes and Selector, for building packs.
export * from "./core/values";
export { Selector, SelectorScore, type SelectorBase } from "./core/frontend/nodes/selector";
// The builder `Objective`, not the string alias in values/enums.
export { Objective, usedStatCriteria, type ObjectiveKind } from "./core/frontend/nodes/objective";
// Animation lives in `spool`; the core only exposes the timing contract.
export { FOREVER, TICKS_PER_SECOND, type Countdown } from "./core/timing/scoreboard-timing";
export type { FunctionRef } from "./core/function_ref";
// Builds a `Datapack` into a path → contents map, without writing to disk.
export { buildDatapack } from "./core/codegen/codegen";
// Where generated helper functions live.
export { PRIVATE_ROOT, privateChild, privateName } from "./core/private-fn";
// Per-tick cost analysis (`dp.report()` / `dp.printReport()`).
export {
  analyzeCost,
  formatCostReport,
  type CostReport,
  type TickRootCost,
  type CallSiteCost,
  type FunctionCost,
  type NbtRead,
  type Lint,
  type LintRule,
  NBT_READ_MIN_PERIOD,
} from "./core/report/cost";
// Measured profile report (`dp.profileReport(raw)`).
export {
  analyzeProfile,
  formatProfileReport,
  toFoldedStacks,
  type ProfileDump,
  type ProfileDumpSpan,
  type ProfileDumpFrame,
  type ProfileDumpCall,
  type ProfileReport,
  type ProfileSpanReport,
  type ProfiledFunction,
  type ProfiledCommand,
} from "./core/report/profile-report";
// Debug source tracking: maps emitted commands to TS lines.
export {
  ignoreSourceFrames,
  type DebugOptions,
  type SourceLoc,
} from "./core/debug/sources";
// Exported explicitly since command-file exports aren't at the package root.
export { triggerCmd } from "./core/commands/trigger";

// Profile types and `profileFromRaw` work anywhere; disk-loaded constants are in `index.ts`
// only.
export type {
  PackFormatSpec,
  RegistrySet,
  CommandTree,
  VersionProfile,
} from "./versions/profile";
export { normalizeId, validateRegistryId } from "./versions/registry";
export { profileFromRaw, type RawProfile } from "./versions/raw-profile";
