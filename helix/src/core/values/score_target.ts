import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";

/**
 * A score holder: a selector or a fake-player name like `#math`.
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
