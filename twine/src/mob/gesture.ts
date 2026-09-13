import { add, mulQuat, rotateAboutPivot, round6 } from "helix";
import type { Detector, DisplayValue, Quat, Transform, Vec3 } from "helix";
import type { MobTick } from "./builder";

/**
 * A one-shot animation of rig members, e.g. a swing or a head tilt.
 *
 * Snaps to a rotation about a pivot, then interpolates back to rest.
 */
export interface Gesture<S extends string = never> {
  /** Which members move, as indices into the model's `members()` (root is 0). */
  members: number[];
  /** What they turn about, in the model's own coordinates (the group `offset` is added for you). */
  pivot: Vec3;
  /**
   * The rotation to raise to.
   *
   * An array is a sequence, one pose per poll, used for rotations too big for one snap (a
   * spin). `cooldown` must be longer than the number of steps.
   */
  rotate: Quat | Quat[];
  /**
   * A rotation held for the whole gesture that turns members in place without moving them.
   *
   * Put it in `rotate` instead and the members' positions rotate too.
   */
  tilt?: Quat;
  /** Ticks the first pose takes to ease in, and how long it's held. Default `0`. */
  rise?: number;
  /** Extra polls to hold the last pose before falling back. Default `0`. Needs a long enough cooldown. */
  linger?: number;
  /** Ticks the fall takes (default `4`). A feel knob - shorter is snappier. */
  fall?: number;
  /** Ticks before it can fire again (default `20`). Ignored for manual calls. */
  cooldown?: number;
  /** When it fires, evaluated as the mob at its own position. Omit for manual-only. */
  when?: Detector;
  /**
   * Commands run with the gesture, as and at the mob, e.g. the hit that goes with a swing.
   *
   * See {@link fireAfter} to land it later in the animation.
   */
  onFire?: MobTick<S>;
  /** Ticks after the raise that {@link onFire} runs. Default `0`. Must land inside the cooldown. */
  fireAfter?: number;
  /** Commands run {@link recoverAfter} ticks after the raise, e.g. reloading a crossbow. Must land inside the cooldown. */
  onRecover?: MobTick<S>;
  /** Ticks after the raise that {@link onRecover} lands. Default `0`. */
  recoverAfter?: number;
}

/** A {@link Gesture} with its defaults filled in and its timeline worked out. */
export interface ResolvedGesture<S extends string = never>
  extends Omit<Gesture<S>, "rise" | "linger" | "fall" | "cooldown" | "fireAfter" | "recoverAfter"> {
  name: string;
  rise: number;
  linger: number;
  fall: number;
  cooldown: number;
  fireAfter: number;
  recoverAfter: number;
  /** The poses, as a sequence - the single-quat form is the one-step case. */
  steps: Quat[];
  /** Walked down the cooldown clock, rather than dropped by the raised tag on the next poll. */
  sequenced: boolean;
  /** Every pose write, in polls after the raise. */
  schedule: PoseWrite[];
}

/** One pose write: `q` is held (or rest, for `undefined`) from `poll`, easing over `duration` ticks. */
export interface PoseWrite {
  poll: number;
  q: Quat | undefined;
  duration: number;
}

/** Fills in a gesture's defaults and checks every timed part lands inside its cooldown. */
export function resolveGesture<S extends string>(name: string, g: Gesture<S>, tickEvery: number): ResolvedGesture<S> {
  const steps = Array.isArray(g.rotate[0]) ? (g.rotate as Quat[]) : [g.rotate as Quat];
  const r: ResolvedGesture<S> = {
    ...g,
    name,
    rise: g.rise ?? 0,
    linger: g.linger ?? 0,
    fall: g.fall ?? 4,
    cooldown: g.cooldown ?? 20,
    fireAfter: g.fireAfter ?? 0,
    recoverAfter: g.recoverAfter ?? 0,
    steps,
    sequenced: steps.length > 1 || (g.linger ?? 0) > 0,
    schedule: [],
  };
  r.schedule = poseSchedule(r, tickEvery);

  // The cooldown is the clock steps and delays are counted on, so it must outlast them.
  const end = r.schedule.at(-1)!.poll;
  if (r.sequenced && r.cooldown <= end) {
    throw new Error(
      `Gesture "${name}" comes home ${end} polls in (steps, rise hold and linger) but has a cooldown of ${r.cooldown} - the cooldown is the step clock, so it must be longer.`,
    );
  }
  const delays: [string, number, boolean][] = [
    ["fires its hit", r.fireAfter, r.fireAfter > 0],
    ["recovers", r.recoverAfter, !!r.onRecover],
  ];
  for (const [what, after, used] of delays) {
    if (used && r.cooldown <= after) {
      throw new Error(
        `Gesture "${name}" ${what} ${after} ticks in but has a cooldown of ${r.cooldown} - the cooldown is the clock the delay is counted on, so it must be longer.`,
      );
    }
  }
  return r;
}

/**
 * Every pose write a gesture makes, in polls after the raise.
 *
 * The emitter and the preview both read this, so the preview matches the game.
 */
function poseSchedule(g: ResolvedGesture<string>, tickEvery: number): PoseWrite[] {
  // Only `rise` beyond 1 holds the first pose longer, so `rise: 0` output is unchanged.
  const hold = Math.max(0, g.rise - 1);
  const later = g.steps.slice(1).map((q, k) => ({ poll: hold + k + 1, q, duration: tickEvery }));
  return [
    { poll: 0, q: g.steps[0], duration: g.rise },
    ...later,
    // A one-step gesture drops on the very next poll: its hold never applies.
    { poll: g.sequenced ? hold + g.steps.length + g.linger : 1, q: undefined, duration: g.fall },
  ];
}

/** A member's transform while holding `q`, or its rest pose for `undefined`. */
export function memberPose(model: DisplayValue, g: ResolvedGesture<string>, i: number, q: Quat | undefined): Transform {
  const rest = model.members()[i]?.transform;
  if (!rest) throw new Error(`Gesture member ${i} is not a member of the model.`);
  if (!q) return rest;
  // Rotating about the pivot moves the position and turns the orientation.
  return {
    ...rest,
    translation: rotateAboutPivot(rest.translation ?? [0, 0, 0], add(g.pivot, model.getOffset()), q).map(round6) as Vec3,
    leftRotation: mulQuat(g.tilt ? mulQuat(q, g.tilt) : q, rest.leftRotation ?? [0, 0, 0, 1]).map(round6) as Quat,
  };
}

/** A mob rig as the game sees it: each member's rest transform, and every write each gesture makes. */
export interface MobPreview {
  tickEvery: number;
  /** The model's group offset - gesture pivots here include it, authored ones don't. */
  offset: Vec3;
  members: { kind: "item" | "block"; id: string; transform: Transform }[];
  gestures: {
    name: string;
    pivot: Vec3;
    members: number[];
    steps: Quat[];
    tilt?: Quat;
    rise: number;
    linger: number;
    fall: number;
    writes: { tick: number; duration: number; poses: Record<number, Transform> }[];
  }[];
}

/** The model and every gesture's pose timeline, resolved to plain transforms. */
export function mobPreview(model: DisplayValue, gestures: ResolvedGesture<string>[], tickEvery: number): MobPreview {
  const members = model.members().map(({ content, transform }) => ({
    kind: content.kind,
    id: content.kind === "item" ? content.item.baseId() : content.block.toBlockState().Name,
    transform,
  }));
  return {
    tickEvery,
    offset: model.getOffset(),
    members,
    gestures: gestures.map((g) => ({
      name: g.name,
      pivot: add(g.pivot, model.getOffset()),
      members: g.members,
      steps: g.steps,
      tilt: g.tilt,
      rise: g.rise,
      linger: g.linger,
      fall: g.fall,
      writes: g.schedule.map((w) => ({
        tick: w.poll * tickEvery,
        duration: w.duration,
        poses: Object.fromEntries(g.members.map((i) => [i, memberPose(model, g, i, w.q)])),
      })),
    })),
  };
}
