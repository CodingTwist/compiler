// The interface every clip track implements.
import type { FunctionContext } from "helix";

export type TrackMode = "smooth" | "frame";

/** A compiled track the clip can drive. */
export interface Track {
  readonly mode: TrackMode;
  /** A track with nothing to animate (an untouched primary model track); skipped. */
  empty(): boolean;
  /** Highest absolute keyframe tick this track defines (0 if it spans the clip duration). */
  length(): number;
  /** Distinct frame count for frame mode (the clip cycles `frame_(t % period)`). */
  period(duration: number): number;
  /** If this track is a pure periodic spin, its revolution frame count (for snap). */
  revolution(): number | undefined;
  /** Frame mode: emit the commands for frame index `f`. */
  emitFrame(
    ctx: FunctionContext,
    f: number,
    period: number,
    duration: number,
  ): void;
  /** Smooth mode: emit the one-shot native tween toward the end pose (or base if `reverse`). */
  emitSmooth(ctx: FunctionContext, duration: number, reverse: boolean): void;
}
