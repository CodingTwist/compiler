// The score cell and range a score trigger denotes.
import { Range, ScoreTarget } from "helix";
import type { ScoreTrigger } from "../area";
import type { Wiring } from "./types";

/** The trigger's score cell. */
export function scoreOf(w: Wiring, trigger: ScoreTrigger) {
  return w.dp.objective(trigger.objective).score(ScoreTarget(trigger.target));
}

/** Either form of {@link ScoreTrigger} as the one `matches` range it denotes. */
export function scoreRange(trigger: ScoreTrigger): Range {
  if (trigger.matches) return new Range(trigger.matches.min, trigger.matches.max);
  if (trigger.equals === undefined) {
    throw new Error(
      `Score trigger on "${trigger.objective}" needs either \`equals\` or \`matches\``,
    );
  }
  return Range.exactly(trigger.equals);
}
