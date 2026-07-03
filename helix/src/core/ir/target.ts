/**
 * The runtime a pack is being compiled for. The same source can be built for
 * more than one runtime: `"vanilla"` is a plain datapack that runs anywhere
 * (singleplayer, any vanilla-compatible server); `"paper"` is a datapack meant
 * to run on a Paper server alongside a companion plugin, where chosen ops are
 * emitted as native plugin (Brigadier) calls instead of command expansions.
 *
 * Only `ctx.native(...)` ops branch on this; every other command renders the
 * same regardless of target.
 */
export type RuntimeTarget = "vanilla" | "paper";

/** The default runtime when none is specified: a portable vanilla datapack. */
export const DEFAULT_TARGET: RuntimeTarget = "vanilla";
