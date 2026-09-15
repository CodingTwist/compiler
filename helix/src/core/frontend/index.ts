export * from "./nodes";
export * from "./context";
export { Detect, detect, type Detector, type OnHit } from "./detect";
// Exported so consumers can type their own detectors.
export type { ExecuteBuilder } from "../commands/execute";

// Side-effect import: installs every `ctx.<command>()`.
import "../commands";

// Side-effect import: installs the code-first data facade (ctx.storage/entity/block).
import "./data";
