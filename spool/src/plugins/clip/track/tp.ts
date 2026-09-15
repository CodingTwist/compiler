// The teleport track: moves a selector along keyframes, optionally gliding.
import { DisplayBase, Pos, Selector } from "helix";
import type { FunctionContext, Vec3 } from "helix";
import { sampleVec3, type Keyframe } from "../value";
import type { Track, TrackMode } from "./types";

/**
 * Teleports a selector along keyframes. One `tp` per tick by default.
 *
 * With `glide`, teleports only on keyframes and sets `teleport_duration` so the client
 * tweens:
 * fewer commands and smoother. Display entities only.
 */
export class TpTrack implements Track {
  readonly mode: TrackMode = "frame";

  constructor(
    private readonly selector: Selector,
    private readonly keys: readonly Keyframe<Vec3>[],
    private readonly glide = false,
  ) {
    if (keys.length === 0)
      throw new Error("tp track needs at least one keyframe.");
    // The client tween is always linear, so a held ("step") segment can't survive it.
    if (glide && keys.some((k) => k.ease === "step")) {
      throw new Error(
        "a glide tp track can't use a 'step' ease - the client tween is linear.",
      );
    }
  }

  empty(): boolean {
    return false;
  }
  length(): number {
    const last = this.keys[this.keys.length - 1].tick;
    // A glide fires on the last tick, so the clip must include it.
    return this.glide ? last + 1 : last;
  }
  period(duration: number): number {
    return Math.max(1, duration);
  }
  revolution(): undefined {
    return undefined;
  }

  emitFrame(ctx: FunctionContext, f: number): void {
    // `teleport <targets> <location>` isn't valid grammar, so use `execute as <sel> run
    // teleport <x y z>`.
    const tp = (p: Vec3) =>
      this.selector.run((c) => c.teleport(undefined, Pos(p[0], p[1], p[2])))(
        ctx,
      );

    if (!this.glide) {
      tp(sampleVec3(this.keys, f));
      return;
    }
    // Only keyframe ticks do anything. Set the duration before each teleport, since gaps
    // differ.
    const i = this.keys.findIndex((k) => k.tick === f);
    if (i === -1) return;
    const next = this.keys[i + 1];
    ctx
      .data()
      .merge()
      .entity(
        this.selector,
        DisplayBase({ teleportDuration: next ? next.tick - f : 0 }),
      );
    tp(this.keys[i].value);
  }

  emitSmooth(): void {
    throw new Error("TpTrack is frame-only.");
  }
}
