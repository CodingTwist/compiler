/**
 * The runtime a pack is built for: `"vanilla"` runs anywhere; `"paper"` pairs with a
 * companion
 * plugin and emits native calls. Only `ctx.native(...)` depends on it.
 */
export type RuntimeTarget = "vanilla" | "paper";

/** The default runtime when none is specified: a portable vanilla datapack. */
export const DEFAULT_TARGET: RuntimeTarget = "vanilla";
