import { Objective, ScoreTarget, ScoreVec3 } from "helix";
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
  const init: FunctionRef = dp.createFunction("init", "load");
  init.build(() => work.init());

  const vector = (name: string) =>
    ScoreVec3.from((axis) => work.score(ScoreTarget(`#${name}_${axis}`)));

  return { dp, work, steps, vector };
}

/** The shape threaded to the marcher builder - whatever {@link createRaycastState} returns. */
export type RaycastState = ReturnType<typeof createRaycastState>;
