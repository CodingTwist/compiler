import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";

/**
 * Who a score belongs to: a selector (`@s`, `@a[...]`) or a fake-player name
 * (`#math`, `t30`). Both are legitimate score holders in Minecraft, so a
 * `ScoreTarget` wraps either - a bare name is a concept here (a fake player),
 * not an escape hatch. See PHILOSOPHY.md, Principle 1.
 *
 *   ScoreTarget("#total")        -> "#total"
 *   ScoreTarget(Selector.self()) -> "@s"
 */
export class ScoreTargetValue implements CommandValue {
  constructor(private readonly target: string | CommandValue) {}

  render(version: VersionProfile): string {
    return typeof this.target === "string"
      ? this.target
      : this.target.render(version);
  }
}

export type ScoreTarget = ScoreTargetValue;

export const ScoreTarget = (target: string | CommandValue): ScoreTargetValue =>
  new ScoreTargetValue(target);
