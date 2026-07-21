import { FunctionContext } from "..";
import { Score } from "./score";
import { Selector } from "./selector";
import { ScoreTarget } from "../../values/score_target";
import type { ItemValue } from "../../values/item";

/**
 * An objective's tracking criterion: the two common pseudo-criteria (`dummy`,
 * `trigger`) plus any vanilla `minecraft.*` criterion (statistics, custom, etc.).
 * Build statistic criteria with the typed helpers ({@link usedStatCriteria}) so
 * the criterion string isn't hand-assembled at the call site.
 */
export type ObjectiveKind =
  | "dummy"
  | "trigger"
  | VanillaCriterion
  | `minecraft.${string}`
  | `killedByTeam.${string}`
  | `teamkill.${string}`;

/**
 * The bare (un-namespaced) vanilla objective criteria. These aren't statistics -
 * the server mirrors a live player property into the score every tick, which is
 * how a pack reads hunger or health without an `execute store`.
 */
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
 * The `minecraft.used:<item>` statistic criterion for `item` - an objective with
 * this criterion mirrors how many times the player has *used* (e.g. right-clicked)
 * that item. The canonical right-click-detection primitive for `carrot_on_a_stick`
 * / `warped_fungus_on_a_stick` (and any usable item): reset it each tick, and a
 * value `>= 1` next tick means a use happened. Derived from the item's own
 * {@link ItemValue.baseId}, so it stays in lockstep with the item you give.
 */
export function usedStatCriteria(item: ItemValue): ObjectiveKind {
  // Statistic criteria join namespace + path with a dot, not a colon
  // (`minecraft:carrot_on_a_stick` -> `minecraft.carrot_on_a_stick`).
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

  /**
   * A score holder on this objective. Accepts a `Selector` directly (selectors
   * are score holders - `@a`, `@s`, …) or a `ScoreTarget` for a fake-player name
   * (`#count`). A `Selector` is wrapped, since it is itself a `CommandValue`.
   */
  score(target: ScoreTarget | Selector) {
    return new Score(this, target instanceof Selector ? ScoreTarget(target) : target);
  }

  enable(ctx: FunctionContext, selector: Selector) {
    return ctx.scoreEnable(selector, this);
  }
}
