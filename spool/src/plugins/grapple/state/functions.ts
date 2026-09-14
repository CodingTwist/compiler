// The table of every function the grapple plugin emits.
import type { Datapack } from "helix";

/**
 * Every function the plugin emits, created up front so bodies can reference each other.
 * The web raycast is the `raycast` plugin's function.
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
