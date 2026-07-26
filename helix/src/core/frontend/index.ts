export * from "./nodes";
export * from "./context";
export { Detect, detect, type Detector, type OnHit } from "./detect";
// The chain builder a `Detector` appends to - a type-only need for consumers
// writing their own detectors, but it must be nameable outside the package.
export type { ExecuteBuilder } from "../commands/execute";

// Side-effect import: installs every `ctx.<command>()` entry (the per-command
// files under src/core/commands augment FunctionContext's prototype).
import "../commands";

// Side-effect import: installs the code-first data facade (ctx.storage/entity/block).
import "./data";