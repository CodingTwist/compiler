import type { Scratch } from "./scratch";
import type { StateRepository } from "./state.repository";
import type { Constants } from "./constants";
import type { GrappleFunctions } from "./functions";

interface InitDeps {
  fn: GrappleFunctions;
  scratch: Scratch;
  repo: StateRepository;
  consts: Constants;
}

/**
 * `grapple/init` (load-tagged): create every objective the plugin uses (scratch, constants,
 * and the repository's per-player state) and seed the constants the pendulum math multiplies
 * by (from the `consts.seeds` table, itself sourced from `tuning.ts`). The grapple-id counter
 * is the one exception - it persists across the run, so it's seeded once, conditionally.
 */
export function defineInit(d: InitDeps): void {
  d.fn.init.build((ctx) => {
    const objectives = [d.scratch.work, d.consts.objective, ...d.repo.objectives];
    for (const o of objectives) ctx.scoreInit(o);

    for (const [score, value] of d.consts.seeds) ctx.scoreSet(score.set(value));

    // The grapple-id counter persists across the run; only seed it if unset (load runs on
    // every reload, and we must not reset live anchors' ids to 0). A score compared to itself
    // fails when it has no value, so `unless` fires exactly once.
    ctx
      .execute()
      .unlessScore(d.consts.nextId, "=", d.consts.nextId)
      .run((b) => b.scoreSet(d.consts.nextId.set(0)));
  });
}
