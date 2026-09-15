// A clip's shared state, and how its duration, mode and frame period are worked out.
import type { Datapack, FunctionContext } from "helix";
import type { Track } from "./track";

export type Emit = (ctx: FunctionContext) => void;

/** The resolved timing of a clip. */
export interface Resolved {
  duration: number;
  mode: "smooth" | "frame";
  period: number;
  cycling: boolean;
}

/** Everything a {@link Clip} collects before it compiles. */
export interface ClipState {
  readonly dp: Datapack;
  /** The author-facing label (the display's name); used in error messages and score holders. */
  readonly label: string;
  /** Function path under the private root. */
  readonly name: string;
  readonly tracks: Track[];
  readonly events: Map<number, Emit[]>;
  durationTicks?: number;
  snapDeg?: number;
  // Which drivers were used, so unused ones aren't generated.
  usedPlay: boolean;
  usedReverse: boolean;
  usedTick: boolean;
  resolved?: Resolved;
}

/** The tracks that have anything to animate. */
export function activeTracks(s: ClipState): Track[] {
  return s.tracks.filter((t) => !t.empty());
}

/** Resolve the clip's duration, mode, and frame period (memoised). */
export function resolve(s: ClipState): Resolved {
  if (s.resolved) return s.resolved;
  const tracks = activeTracks(s);
  if (tracks.length === 0) throw new Error(`Clip "${s.label}" has no tracks.`);

  const modes = new Set(tracks.map((t) => t.mode));
  if (modes.has("smooth") && modes.has("frame")) {
    throw new Error(
      `Clip "${s.label}" mixes a native-tween track with a baked one - split them ` +
        `into separate clips (or a Cutscene).`,
    );
  }
  const mode = modes.has("frame") ? "frame" : "smooth";

  const maxLen = Math.max(0, ...tracks.map((t) => t.length()));
  const pureSpinRev = tracks.length === 1 ? tracks[0].revolution() : undefined;
  let duration = s.durationTicks ?? (maxLen > 0 ? maxLen : (pureSpinRev ?? 20));
  duration = Math.max(duration, maxLen, 1);

  // A pure spin can loop one revolution of frames; events need a full bake.
  const cycling =
    mode === "frame" && pureSpinRev !== undefined && s.events.size === 0;
  if (s.snapDeg !== undefined && pureSpinRev !== undefined) {
    duration = snapDuration(s, duration, pureSpinRev);
  }
  const period = cycling ? pureSpinRev! : duration;
  s.resolved = { duration, mode, period, cycling };
  return s.resolved;
}

/** Adjusts `duration` so a spin's last frame lands on a multiple of `snapDeg`. */
function snapDuration(s: ClipState, duration: number, N: number): number {
  const framesPerSnap = (s.snapDeg! * N) / 360;
  if (
    !Number.isInteger(framesPerSnap) ||
    framesPerSnap <= 0 ||
    N % framesPerSnap !== 0
  ) {
    throw new Error(
      `snap(${s.snapDeg}) doesn't divide the spin evenly (${360 / N}°/frame). Use a ` +
        `snap that's a multiple of the per-frame step.`,
    );
  }
  const rest = (((duration - 1) % N) + N) % N;
  const snapped = Math.round(rest / framesPerSnap) * framesPerSnap;
  return Math.max(1, duration + (snapped - rest));
}
