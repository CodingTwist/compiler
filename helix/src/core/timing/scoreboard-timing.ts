// Scoreboard timers: countdowns on `anim_life`, periodic clocks on `clock`. Scores survive
// /reload.
import { Range, FunctionNode } from "../ir/node";
import type { ExpressionNode } from "../ir/node";
import { ScoreRangeNode } from "../commands/if";
import type { Datapack } from "../ir/datapack";
import type { FunctionContext } from "../frontend/context";
import type { FunctionRef } from "../function_ref";
import type { Objective } from "../frontend/nodes/objective";
import { ScoreTarget } from "../values/score_target";
import { privateName } from "../private-fn";

// The shared clock driver, under the private root.
const CLOCK = privateName("clock");

export const TICKS_PER_SECOND = 20;

/** Max signed 32-bit score - an effectively-infinite countdown (~3.4 years). */
export const FOREVER = 2147483647;

/** A named, ticking-down counter: an (objective, holder) pair measured in ticks. */
export interface Countdown {
  objective: Objective;
  holder: string;
}

/**
 * Countdowns are a score per holder on `anim_life`; periodic clocks are fake players on
 * `clock`.
 */
export class ScoreboardTiming {
  // Periods whose cycle-counter driver has already been installed in `__clock`.
  private installed = new Set<number>();
  // `${period}:${phase}` pairs whose fire-check has been installed in `__clock`.
  private firesInstalled = new Set<string>();

  start(ctx: FunctionContext, c: Countdown, ticks: number): void {
    c.objective.score(ScoreTarget(c.holder)).set(ticks);
  }

  stop(ctx: FunctionContext, c: Countdown): void {
    c.objective.score(ScoreTarget(c.holder)).set(0);
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
    c.objective.score(ScoreTarget(c.holder)).remove(1);
  }

  everyTicks(
    dp: Datapack,
    periodTicks: number,
    label: string,
    phase = 0,
  ): FunctionRef {
    const ph = this.ensureCounter(dp, periodTicks, phase);
    const hook =
      ph === 0 ? `${CLOCK}/every_${label}` : `${CLOCK}/every_${label}_p${ph}`;
    const holder = `t${periodTicks}`;
    const clock = dp.objective("clock");

    // Per-(period, phase) fire check: call the hook when the counter == phase.
    const key = `${periodTicks}:${ph}`;
    if (!this.firesInstalled.has(key)) {
      this.firesInstalled.add(key);
      dp.getOrCreateFunction(CLOCK, "tick").build((ctx) => {
        const at = new ScoreRangeNode(
          ScoreTarget(holder),
          clock,
          new Range(ph, ph),
        );
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

  /** Installs the per-period counter (idempotent) and returns the normalised phase. */
  private ensureCounter(
    dp: Datapack,
    periodTicks: number,
    phase: number,
  ): number {
    const clock = dp.objective("clock");
    const holder = `t${periodTicks}`;
    if (!this.installed.has(periodTicks)) {
      this.installed.add(periodTicks);
      dp.getOrCreateFunction(CLOCK, "tick").build((ctx) => {
        clock.score(ScoreTarget(holder)).add(1);
        const wrap = new ScoreRangeNode(
          ScoreTarget(holder),
          clock,
          new Range(periodTicks, undefined),
        );
        ctx.if(wrap, (c) => clock.score(ScoreTarget(holder)).set(0));
      });
    }
    // Normalise phase into [0, periodTicks); negatives wrap forwards.
    return ((phase % periodTicks) + periodTicks) % periodTicks;
  }
}
