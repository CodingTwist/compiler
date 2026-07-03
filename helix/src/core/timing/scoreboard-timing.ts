// Default TimingStrategy: realise countdowns and periodic clocks with a
// scoreboard. Countdowns are a per-holder score on the `anim_life` objective;
// periodic clocks are a per-period fake-player on a shared `clock` objective that
// the `__clock` tick driver increments and resets. Scores survive /reload, so a
// running animation keeps going across reloads.
import { Range, FunctionNode } from "../ir/node";
import type { ExpressionNode } from "../ir/node";
import { ScoreRangeNode } from "../commands/if";
import type { Datapack } from "../ir/datapack";
import type { FunctionContext } from "../frontend/context";
import type { FunctionRef } from "../function_ref";
import { Countdown, TimingStrategy } from "./strategy";
import { ScoreTarget } from "../values/score_target";
import { privateName } from "../private-fn";

// The shared per-tick clock driver, tucked under the private root so it sorts
// away from authored functions rather than to the top of the list.
const CLOCK = privateName("clock");

export class ScoreboardTiming implements TimingStrategy {
  // Periods whose cycle-counter driver has already been installed in `__clock`.
  private installed = new Set<number>();
  // `${period}:${phase}` pairs whose fire-check has been installed in `__clock`.
  private firesInstalled = new Set<string>();

  start(ctx: FunctionContext, c: Countdown, ticks: number): void {
    c.objective.score(ScoreTarget(c.holder)).set(ticks, ctx);
  }

  stop(ctx: FunctionContext, c: Countdown): void {
    c.objective.score(ScoreTarget(c.holder)).set(0, ctx);
  }

  active(c: Countdown): ExpressionNode {
    return new ScoreRangeNode(
      ScoreTarget(c.holder),
      c.objective,
      new Range(1, undefined),
    );
  }

  advance(ctx: FunctionContext, c: Countdown): void {
    // `scoreboard players add` rejects negatives - decrement with `remove`.
    c.objective.score(ScoreTarget(c.holder)).remove(1, ctx);
  }

  everyTicks(
    dp: Datapack,
    periodTicks: number,
    label: string,
    phase = 0,
  ): FunctionRef {
    const ph = this.ensureCounter(dp, periodTicks, phase);
    const hook = ph === 0 ? `${CLOCK}/every_${label}` : `${CLOCK}/every_${label}_p${ph}`;
    const holder = `t${periodTicks}`;
    const clock = dp.objective("clock");

    // Per-(period, phase) fire check: call the hook when the counter == phase.
    const key = `${periodTicks}:${ph}`;
    if (!this.firesInstalled.has(key)) {
      this.firesInstalled.add(key);
      dp.getOrCreateFunction(CLOCK, "tick").build((ctx) => {
        const at = new ScoreRangeNode(ScoreTarget(holder), clock, new Range(ph, ph));
        ctx.if(at, (c) => c.emit(new FunctionNode(hook)));
      });
    }

    // Reused across calls so multiple hooks of the same (period, phase) share one.
    return dp.getOrCreateFunction(hook);
  }

  phaseGate(dp: Datapack, periodTicks: number, phase = 0): ExpressionNode {
    const ph = this.ensureCounter(dp, periodTicks, phase);
    return new ScoreRangeNode(
      ScoreTarget(`t${periodTicks}`),
      dp.objective("clock"),
      new Range(ph, ph),
    );
  }

  /**
   * Install the shared per-period cycle counter (idempotent) and return the
   * normalised phase. The counter counts 0..period-1, wrapping at the period, so
   * each tick lands on exactly one residue and distinct phases fall on distinct
   * ticks.
   */
  private ensureCounter(dp: Datapack, periodTicks: number, phase: number): number {
    const clock = dp.objective("clock");
    const holder = `t${periodTicks}`;
    if (!this.installed.has(periodTicks)) {
      this.installed.add(periodTicks);
      dp.getOrCreateFunction(CLOCK, "tick").build((ctx) => {
        clock.score(ScoreTarget(holder)).add(1, ctx);
        const wrap = new ScoreRangeNode(
          ScoreTarget(holder),
          clock,
          new Range(periodTicks, undefined),
        );
        ctx.if(wrap, (c) => clock.score(ScoreTarget(holder)).set(0, c));
      });
    }
    // Normalise phase into [0, periodTicks); negatives wrap forwards.
    return ((phase % periodTicks) + periodTicks) % periodTicks;
  }
}
