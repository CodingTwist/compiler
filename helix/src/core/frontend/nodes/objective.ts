import { FunctionContext } from "..";
import { Score } from "./score";
import { Selector } from "./selector";
import { ScoreTarget } from "../../values/score_target";
import type { ItemValue } from "../../values/item";

/**
 * An objective's criterion: `dummy`, `trigger`, or any vanilla `minecraft.*` criterion.
 * Build statistics with helpers like {@link usedStatCriteria}.
 */
export type ObjectiveKind =
  | "dummy"
  | "trigger"
  | VanillaCriterion
  | `minecraft.${string}`
  | `killedByTeam.${string}`
  | `teamkill.${string}`;

/** Vanilla criteria that mirror a live player property (hunger, health…) every tick. */
export type VanillaCriterion =
  | "deathCount"
  | "playerKillCount"
  | "totalKillCount"
  | "health"
  | "food"
  | "air"
  | "armor"
  | "xp"
  | "level";

/**
 * The `minecraft.used:<item>` criterion for `item`, for right-click detection.
 * Reset it each tick; `>= 1` next tick means a use.
 */
export function usedStatCriteria(item: ItemValue): ObjectiveKind {
  // Statistic criteria use a dot, not a colon: `minecraft.carrot_on_a_stick`.
  return `minecraft.used:${item.baseId().replace(":", ".")}` as ObjectiveKind;
}

export class Objective {
  constructor(
    public objective: string,
    public kind: ObjectiveKind = "dummy",
  ) {}

  getName(): string {
    return this.objective;
  }

  toJson() {
    return this.objective;
  }

  /** A score holder on this objective: a `Selector` or a fake-player `ScoreTarget`. */
  score(target: ScoreTarget | Selector) {
    return new Score(this, target instanceof Selector ? ScoreTarget(target) : target);
  }

  enable(ctx: FunctionContext, selector: Selector) {
    return ctx.scoreEnable(selector, this);
  }
}
