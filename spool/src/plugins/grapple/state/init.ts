// `grapple/init`: creates objectives and seeds constants.
import type { GrappleFunctions } from "./functions";
import type { Scratch } from "./scratch";
import type { Constants } from "./constants";
import type { StateRepository } from "./repository";

interface InitDeps {
  fn: GrappleFunctions;
  scratch: Scratch;
  repo: StateRepository;
  consts: Constants;
}

/** `grapple/init` (load): creates objectives and seeds constants from `tuning.ts`. */
export function defineInit(d: InitDeps): void {
  d.fn.init.build((ctx) => {
    const objectives = [
      d.scratch.work,
      d.consts.objective,
      ...d.repo.objectives,
    ];
    for (const o of objectives) o.init();

    for (const [score, value] of d.consts.seeds) score.set(value);

    // Only seed the id counter if unset; reloads must not reset live anchors' ids.
    ctx
      .execute()
      .unlessScore(d.consts.nextId, "=", d.consts.nextId)
      .run((b) => d.consts.nextId.set(0));
  });
}
