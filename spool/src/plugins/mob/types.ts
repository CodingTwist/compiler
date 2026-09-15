// The public types of a custom mob: its bodies and states.
import type { Datapack, FunctionContext, Score } from "helix";
import type { Difficulty } from "../difficulty";

/** Options for {@link MobBuilder.build}. */
export interface MobOptions {
  /** How often, in ticks, the caller runs {@link Mob.tick} (default `2`). Gesture timings are counted in these polls. */
  tickEvery?: number;
  /**
   * How near a player must be for the mob to run at all. Default `48`, checked once a second.
   *
   * Keep it above the mob's `FOLLOW_RANGE` so it wakes before it aggros.
   */
  wakeRange?: number;
}

/** Per-mob body, run as and at the mob. `mob` switches between its {@link MobBuilder.states}. */
export type MobTick<S extends string = never> = (
  ctx: FunctionContext,
  dp: Datapack,
  mob: MobStates<S>,
) => void;

/** Run as and at one mob for the pack's difficulty `level`. Built once per level. */
export type MobDifficulty = (
  ctx: FunctionContext,
  dp: Datapack,
  level: Difficulty,
) => void;

/** One phase of a mob, e.g. airborne or stunned. A mob is in at most one state, stored as a score. */
export interface MobState<S extends string> {
  /** Polls it lasts. Omit to stay until something enters another state. */
  polls?: number;
  /** Once, on entering, as the mob, at it. */
  onEnter?: MobTick<S>;
  /** Each poll while in it, as the mob, at it - after the clock has counted down. */
  tick?: MobTick<S>;
  /** When {@link polls} run out, before {@link then}. */
  onDone?: MobTick<S>;
  /** Entered when {@link polls} run out. Omit to go back to no state. */
  then?: S;
}

/** A mob's state switch, handed to every body that runs as the mob. */
export interface MobStates<S extends string> {
  /** Put this mob (`@s`) into `state`, running its `onEnter`. */
  enter(ctx: FunctionContext, state: S): void;
  /** Take this mob (`@s`) out of any state. */
  leave(ctx: FunctionContext): void;
  /**
   * Runs `body` for the pack's difficulty level, e.g. `damage(..., config[level].hitDamage)`.
   *
   * Built once per level, so `if (!config[level].shockwave) return` drops a feature.
   */
  byDifficulty(
    ctx: FunctionContext,
    body: (ctx: FunctionContext, level: Difficulty) => void,
  ): void;
  /** Polls left in the current timed state, on `@s` - what phases within a state test. */
  readonly clock: Score;
}
