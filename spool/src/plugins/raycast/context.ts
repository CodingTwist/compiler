import { Objective, ScoreTarget } from "helix";
import type { Datapack, FunctionRef } from "helix";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

/**
 * Shared raycast state per pack: the `raycast.work` objective, per-ray step slots, and its
 * load init.
 */
export function createRaycastState(dp: Datapack) {
  const work = new Objective("raycast.work");

  // `#<name>_steps`: this ray's remaining steps. Slashes in the name become `_`.
  const steps = (name: string): Score =>
    work.score(ScoreTarget(`#${name.replace(/\//g, "_")}_steps`));

  // One load-init for the whole plugin, wired the first time a pack casts.
  const init: FunctionRef = dp.createFunction("raycast/init", "load");
  init.build(() => work.init());

  return { dp, work, steps };
}

/** The shape threaded to the marcher builder - whatever {@link createRaycastState} returns. */
export type RaycastState = ReturnType<typeof createRaycastState>;
