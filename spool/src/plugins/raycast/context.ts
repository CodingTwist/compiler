import { Objective, ScoreTarget } from "helix";
import type { Datapack, FunctionRef } from "helix";

/** A bound scoreboard slot - what `Objective.score(...)` yields. */
type Score = ReturnType<Objective["score"]>;

/**
 * The raycast plugin's shared, per-`Datapack` state: the one `raycast.work`
 * objective every marcher counts its remaining steps on, a factory for a named
 * per-instance step slot, and the `load`-tagged init that creates the objective
 * (built exactly once, however many `dp.raycast(...)` marchers a pack registers).
 *
 * Each `dp.raycast({ name })` call reuses this state and adds its own marcher
 * function + `#<name>_steps` slot on top of it, so the marchers never fight over
 * the objective and the objective is only declared once.
 */
export function createRaycastState(dp: Datapack) {
  const work = new Objective("raycast.work");

  // `#<name>_steps` on `raycast.work`: this marcher's remaining reach, decremented
  // per step and gated on `> 0` so a run can never march past its budget. Slashes in
  // the name (path separators) are flattened to `_` so it stays a tidy fake-player slot.
  const steps = (name: string): Score =>
    work.score(ScoreTarget(`#${name.replace(/\//g, "_")}_steps`));

  // One load-init for the whole plugin, wired the first time a pack casts.
  const init: FunctionRef = dp.createFunction("raycast/init", "load");
  init.build((ctx) => ctx.scoreInit(work));

  return { dp, work, steps };
}

/** The shape threaded to the marcher builder - whatever {@link createRaycastState} returns. */
export type RaycastState = ReturnType<typeof createRaycastState>;
