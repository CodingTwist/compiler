/**
 * A named animation timeline of {@link Track}s, compiled to functions.
 *
 * - `play(ctx)` / `reverse(ctx)`: one-shot, scheduled (e.g. a door opening).
 * - `loop(ctx)` + `start(ctx)`/`stop(ctx)`: continuous, scoreboard-timed (e.g. a spinning
 * cog).
 *
 * A clip is either smooth (one native interpolation per member) or frame-baked, never both.
 * Compiled in `dp.onFinalize`, so settings chained after the motion still apply.
 */
import { FunctionId, FunctionNode, Time } from "helix";
import type { FunctionContext } from "helix";
import { resolve } from "./resolve";
import { ClipTimeline } from "./timeline";

export class Clip extends ClipTimeline {
  // --- drivers -----------------------------------------------------------------
  /** Play the clip forward from a function body (`afterTicks` delays the start). */
  play(ctx: FunctionContext, afterTicks = 0): void {
    this.s.usedPlay = true;
    this.call(ctx, "play", afterTicks);
  }
  /** Play the clip backward (door close; spin wind-back). */
  reverse(ctx: FunctionContext, afterTicks = 0): void {
    this.s.usedReverse = true;
    this.call(ctx, "reverse", afterTicks);
  }
  /** Start a continuous, tick-driven run (forever unless a duration was set). */
  loop(ctx: FunctionContext): void {
    this.s.usedTick = true;
    ctx.emit(new FunctionNode(`${this.s.name}/start`));
  }
  /** Begin (or restart) a timed tick-driven run (`afterTicks` staggers it). */
  start(ctx: FunctionContext, afterTicks = 0): void {
    this.s.usedTick = true;
    this.call(ctx, "start", afterTicks);
  }
  /** Halt a tick-driven run. */
  stop(ctx: FunctionContext): void {
    this.s.usedTick = true;
    ctx.emit(new FunctionNode(`${this.s.name}/stop`));
  }

  /** Tick count `play` would schedule (for a {@link Cutscene} to offset). */
  playLength(): number {
    return resolve(this.s).duration;
  }

  /** Ensure the functions a {@link Cutscene} schedules get generated. */
  markForCutscene(): void {
    this.s.usedPlay = true;
  }

  /** Emits the whole timeline into `ctx`, offset by `baseTick`. Used by {@link Cutscene}. */
  scheduleInto(ctx: FunctionContext, baseTick: number): void {
    const { duration, mode, period: P } = resolve(this.s);
    const ns = this.s.dp.name;
    if (mode === "smooth") {
      if (baseTick <= 0) ctx.emit(new FunctionNode(`${this.s.name}/play`));
      else ctx.schedule().function_(FunctionId(`${ns}:${this.s.name}/play`), Time(baseTick));
      return;
    }
    for (let t = 0; t < duration; t++) {
      const at = baseTick + t;
      const id = FunctionId(`${ns}:${this.s.name}/frame_${t % P}`);
      if (at <= 0) ctx.emit(new FunctionNode(`${this.s.name}/frame_${t % P}`));
      else ctx.schedule().functionAppend(id, Time(at));
    }
  }

  private call(ctx: FunctionContext, which: string, afterTicks: number): void {
    const id = `${this.s.name}/${which}`;
    if (afterTicks > 0) {
      ctx.schedule().function_(FunctionId(`${this.s.dp.name}:${id}`), Time(afterTicks));
    } else {
      ctx.emit(new FunctionNode(id));
    }
  }
}
