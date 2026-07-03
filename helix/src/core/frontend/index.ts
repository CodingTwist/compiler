export * from "./nodes";
export * from "./context";

// Side-effect import: installs every `ctx.<command>()` entry (the per-command
// files under src/core/commands augment FunctionContext's prototype).
import "../commands";

// Side-effect import: installs the code-first data facade (ctx.storage/entity/block).
import "./data";