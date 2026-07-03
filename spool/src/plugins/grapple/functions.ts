import type { Datapack, FunctionRef } from "helix";

/**
 * The grapple function table: every `.mcfunction` the plugin emits, created **up front**
 * so any body can reference any other before the bodies are filled (the controller builds
 * `start`/`tick`/`stop`; the services build their own internals). `init` is `load`-tagged
 * and `tick` is `tick`-tagged; the rest are plain. The web raycast is *not* here - it's the
 * `raycast` plugin's own function (`raycast/grapple/web`).
 */
export function createFunctions(dp: Datapack) {
  return {
    /** `grapple/init` (load) - create objectives + seed constants. */
    init: dp.createFunction("grapple/init", "load"),
    /** `grapple/start` - raycast an anchor and latch the player. Public. */
    start: dp.createFunction("grapple/start"),
    /** `grapple/drive` - one player's per-tick swing step. */
    drive: dp.createFunction("grapple/drive"),
    /** `grapple/constrain` - the taut-tick rope constraint. */
    constrain: dp.createFunction("grapple/constrain"),
    /** `grapple/rope` - the recursive particle-rope marcher. */
    rope: dp.createFunction("grapple/rope"),
    /** `grapple/tick` (tick) - drive every grappling player. */
    tick: dp.createFunction("grapple/tick", "tick"),
    /** `grapple/stop` - release the executing player. Public. */
    stop: dp.createFunction("grapple/stop"),
  } as const;
}

/** The grapple function table - whatever {@link createFunctions} returns. */
export type GrappleFunctions = ReturnType<typeof createFunctions>;
