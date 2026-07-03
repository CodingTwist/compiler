// The timing abstraction. Time-based behaviour - one-shot countdowns (run an
// animation for N ticks) and periodic clocks (do X every N ticks) - is expressed
// against this interface, never against raw scoreboard commands directly. The
// default realisation is scoreboard-based (see ScoreboardTiming); if a better
// primitive becomes available (e.g. a future schedule/macro form), swap it via
// `dp.useTiming(...)` without touching the animation or clock callers.
import type { Datapack } from "../ir/datapack";
import type { FunctionContext } from "../frontend/context";
import type { FunctionRef } from "../function_ref";
import type { ExpressionNode } from "../ir/node";
import type { Objective } from "../frontend/nodes/objective";

export const TICKS_PER_SECOND = 20;

/** Max signed 32-bit score - an effectively-infinite countdown (~3.4 years). */
export const FOREVER = 2147483647;

/** A named, ticking-down counter: an (objective, holder) pair measured in ticks. */
export interface Countdown {
  objective: Objective;
  holder: string;
}

export interface TimingStrategy {
  /** Begin a countdown of `ticks`; it then counts down one per {@link advance}. */
  start(ctx: FunctionContext, c: Countdown, ticks: number): void;
  /** Cancel a countdown immediately (sets it inactive). */
  stop(ctx: FunctionContext, c: Countdown): void;
  /** A condition that holds while the countdown is still running (> 0). */
  active(c: Countdown): ExpressionNode;
  /** Advance the countdown by one tick - call once per tick while active. */
  advance(ctx: FunctionContext, c: Countdown): void;
  /**
   * A hook function that runs every `periodTicks`, optionally offset by `phase`
   * ticks within the period so several periodic hooks of the same period fire on
   * *different* ticks (staggering - spreads per-tick load instead of bunching it).
   * Idempotent per (period, phase): the same pair returns the same appendable
   * function and installs the driver/fire-check once. `label` only names the
   * generated hook function (e.g. "2s", "40t"). `phase` is taken mod `periodTicks`.
   */
  everyTicks(
    dp: Datapack,
    periodTicks: number,
    label: string,
    phase?: number,
  ): FunctionRef;

  /**
   * A condition that holds once every `periodTicks`, offset by `phase` within the
   * period. Installs the shared period counter as a side effect but emits nothing
   * itself - meant to be nested *inside* existing gating (e.g. an area's `active`
   * check) so throttling and staggering compose with it instead of replacing it.
   * `phase` is taken mod `periodTicks`.
   */
  phaseGate(dp: Datapack, periodTicks: number, phase?: number): ExpressionNode;
}
