// The environment-agnostic public surface of helix - everything that is safe to
// import in any runtime (no Node built-ins on its import graph). Both entry
// points build on this: `index.ts` (Node) adds the eager version constants and
// `validateDatapack`; `browser.ts` adds only the pure `profileFromRaw`. Keeping
// the shared surface here means the two entries can't drift.
export { Datapack } from "./core/ir/datapack";
export { type RuntimeTarget } from "./core/ir/target";
export * from "./core/ir/node";
export * from "./core/frontend/";

// The concept value library (Pos, Block, Item, Display, Id, Nbt, ...) and the
// Selector builder are part of the authoring surface: downstream packages build
// packs with these, so they belong in the public API rather than reached for via
// deep `dist/core/...` paths.
export * from "./core/values";
export { Selector, SelectorScore, type SelectorBase } from "./core/frontend/nodes/selector";
// `Objective` exists both as the builder class (frontend) and a `string` alias
// (values/enums); the builder is the one downstream packages author with.
export { Objective, usedStatCriteria, type ObjectiveKind } from "./core/frontend/nodes/objective";
// Animation mechanics (Clip/Slide/DisplayEffect) live in the `spool` package,
// not the core: they're composed AST-building conveniences over this public API, not
// part of the AST→IR→codegen engine. The core only exposes the timing *contract* they
// share with the IR scheduler (`dp.timing`).
export { FOREVER, TICKS_PER_SECOND, type Countdown } from "./core/timing/scoreboard-timing";
export type { FunctionRef } from "./core/function_ref";
// Codegen entry: turn a built `Datapack` into a path→contents map (consumers usually
// call `dp.writeDatapack(dir)`; this is the in-memory form for tests/inspection).
export { buildDatapack } from "./core/codegen/codegen";
// Where compiler-/engine-generated helper functions are tucked so they sort away
// from authored entry points; the spool clip/cutscene engine routes its names through this.
export { PRIVATE_ROOT, privateName } from "./core/private-fn";
// Per-tick cost analysis (`dp.report()` / `dp.printReport()`): worst-case
// commands/tick and unbounded `@e` scan detection.
export {
  analyzeCost,
  formatCostReport,
  type CostReport,
  type TickRootCost,
  type CallSiteCost,
  type FunctionCost,
} from "./core/report/cost-report";
// Command-node factory consumers need for click events etc. (no `new` in consumers).
// Command-file named exports aren't at the package root by default (the index only
// side-effect-imports ../commands), so list it explicitly.
export { triggerCmd } from "./core/commands/trigger";

// Version profile *types* and the pure profile builder are safe everywhere. The
// eager version constants (`v1_21_4`, …) read data from disk at import time, so
// they live in the Node entry (`index.ts`) only; the browser builds a profile
// from fetched JSON via `profileFromRaw`.
export type {
  PackFormatSpec,
  RegistrySet,
  CommandTree,
  VersionProfile,
} from "./versions/profile";
export { normalizeId, validateRegistryId } from "./versions/registry";
export { profileFromRaw, type RawProfile } from "./versions/raw-profile";
