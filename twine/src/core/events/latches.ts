// Latch flags for `once` handlers, and emitting one handler.
import { Range, ScoreTarget } from "helix";
import type { Datapack, FunctionContext, Score } from "helix";
import type { EventHandler } from "./types";

/** Scoreboard objective holding every `once` handler's already-fired flag. */
export const EVENT_OBJECTIVE = "events";

/**
 * Latch flags for `once` handlers: one `#<module>.<method>` score each.
 *
 * A separate objective from `ActiveFlags`, which the tick reads every tick and should stay small.
 */
export class EventLatches {
  private readonly objective;

  constructor(dp: Datapack) {
    this.objective = dp.objective(EVENT_OBJECTIVE);
  }

  /** The already-fired flag for one handler. */
  score(moduleName: string, method: string): Score {
    return this.objective.score(ScoreTarget(`#${moduleName}.${method}`));
  }
}

/** `matches 1` - the "already fired" test, hoisted so both sites agree. */
const FIRED = Range.exactly(1);

/**
 * Emits one handler: latch check, detector, flag set, then the body.
 *
 * The latch check goes first on the same `execute`, so a spent handler only costs a score check.
 * The flag is set before the body so a body that changes its own condition can't re-trigger.
 */
export function emitHandler(
  ctx: FunctionContext,
  handler: EventHandler,
  latch: Score | undefined,
  body: (c: FunctionContext) => void,
): void {
  const chain = ctx.execute();
  if (latch) chain.unlessScoreMatches(latch, FIRED);
  handler.detector(chain);
  chain.runOrInline((c) => {
    latch?.set(1);
    body(c);
  });
}
