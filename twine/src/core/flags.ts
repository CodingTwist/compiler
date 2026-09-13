import type { Datapack, FunctionContext, Score } from "helix";
import { ScoreTarget } from "helix";

/** Scoreboard objective holding every area's `active` flag (`#<area> active`). */
export const ACTIVE_OBJECTIVE = "active";

/** Owns the `active` objective and each area's flag score. */
export class ActiveFlags {
  private readonly objective;

  constructor(dp: Datapack) {
    this.objective = dp.objective(ACTIVE_OBJECTIVE);
  }

  /** The flag score for area `name`, e.g. `#vault active`. */
  score(name: string): Score {
    return this.objective.score(ScoreTarget(`#${name}`));
  }

  /** Set an area's initial flag value in `load`. */
  setDefault(ctx: FunctionContext, name: string, active: boolean): void {
    this.score(name).set(active ? 1 : 0);
  }
}
