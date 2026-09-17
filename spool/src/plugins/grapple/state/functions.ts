// The table of every function the grapple plugin emits.
import type { Datapack } from "helix";

/**
 * Every function the plugin emits, created up front so bodies can reference each other.
 * The web raycast is the `raycast` plugin's function.
 */
export function createFunctions(dp: Datapack) {
  return {
    /** `init` (load) - create objectives + seed constants. */
    init: dp.createFunction("init", "load"),
    /** `start` - raycast an anchor and latch the player. Public. */
    start: dp.public("start"),
    /** `drive` - one player's per-tick swing step. */
    drive: dp.createFunction("drive"),
    /** `constrain` - the taut-tick rope constraint. */
    constrain: dp.createFunction("constrain"),
    /** `rope` - the recursive particle-rope marcher. */
    rope: dp.createFunction("rope"),
    /** `tick` (tick) - drive every grappling player. */
    tick: dp.createFunction("tick", "tick"),
    /** `stop` - release the executing player. Public. */
    stop: dp.public("stop"),
  } as const;
}

/** The grapple function table - whatever {@link createFunctions} returns. */
export type GrappleFunctions = ReturnType<typeof createFunctions>;
