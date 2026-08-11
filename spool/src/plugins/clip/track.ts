/**
 * The track kinds. A track owns *what* it animates and *how it samples* - every
 * track compiles to either:
 *
 *   - **frame mode**: a set of `period` distinct per-tick functions (the clip
 *     cycles `frame_(t % period)`). Always correct, needed for spins (periodic),
 *     multi-keyframe paths, and any non-display target.
 *   - **smooth mode**: a single native-interpolation merge per member that
 *     Minecraft tweens over the whole duration (one command, GPU-smooth). Only
 *     transform tracks that *don't* spin can take this path.
 *
 * A clip is wholly one mode or the other (see `clip.ts`): mixing a periodic spin
 * with a native tween in one clip is rejected - compose them as separate clips or
 * via a `Cutscene`.
 */
import {
  DecomposedTransformation,
  DisplayBase,
  Float,
  Nbt,
  Pos,
  Selector,
  quat,
  rotateAboutPivot,
  round6,
} from "helix";
import type { FunctionContext, Vec3, Quat, Axis } from "helix";
import type { ModelTarget } from "./targets";
import { lerpVec3, nest, sample, sampleVec3, type Keyframe } from "./value";

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

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
  emitFrame(ctx: FunctionContext, f: number, period: number, duration: number): void;
  /** Smooth mode: emit the one-shot native tween toward the end pose (or base if `reverse`). */
  emitSmooth(ctx: FunctionContext, duration: number, reverse: boolean): void;
}

/** Build the per-member transform NBT for one baked frame. */
function transformNbt(translation: Vec3, scale: Vec3, left: Quat, interpDuration: number) {
  const f = (v: number) => Float(round6(v));
  return DisplayBase({
    // The rotations are plain lists in the schema, so they carry their own `f` suffix;
    // scale/translation are encoded as floats for us and only need the rounding.
    transformation: DecomposedTransformation({
      leftRotation: left.map(f),
      rightRotation: IDENTITY_QUAT.map(f),
      scale: scale.map(round6),
      translation: translation.map(round6),
    }),
    startInterpolation: 0,
    interpolationDuration: interpDuration,
  });
}

/**
 * Animates a display model's transform - any combination of `move` (translate),
 * `scale`, `rotateTo` (set orientation), and `spin` (continuous rotation about an
 * axis). A spin makes the track periodic (baked frames); otherwise it tweens
 * natively unless `.bake()` is forced.
 */
export class TransformTrack implements Track {
  private moveDelta?: Vec3;
  private scaleTo?: Vec3;
  private rotateToQ?: Quat;
  private spinAxis?: Axis;
  private spinDegPerTick = 0;
  private forced?: TrackMode;

  constructor(private readonly target: ModelTarget) {}

  move(delta: Vec3): this {
    this.moveDelta = delta;
    return this;
  }
  scale(to: Vec3): this {
    this.scaleTo = to;
    return this;
  }
  rotateTo(q: Quat): this {
    this.rotateToQ = q;
    return this;
  }
  spin(axis: Axis, degPerTick: number): this {
    if (!Number.isFinite(degPerTick) || degPerTick === 0) {
      throw new Error(`spin speed must be a nonzero number (got ${degPerTick}).`);
    }
    this.spinAxis = axis;
    this.spinDegPerTick = degPerTick;
    return this;
  }
  /** Force per-tick baked frames even for an otherwise-tweenable track. */
  bake(): this {
    this.forced = "frame";
    return this;
  }
  /** Force the native-interpolation path (rejected if the track spins). */
  smooth(): this {
    if (this.spinAxis) throw new Error("a spinning track cannot be .smooth() - spins must bake.");
    this.forced = "smooth";
    return this;
  }

  empty(): boolean {
    return !this.moveDelta && !this.scaleTo && !this.rotateToQ && this.spinAxis === undefined;
  }

  private get isPureSpin(): boolean {
    return this.spinAxis !== undefined && !this.moveDelta && !this.scaleTo && !this.rotateToQ;
  }

  get mode(): TrackMode {
    if (this.forced) return this.forced;
    return this.spinAxis ? "frame" : "smooth";
  }

  length(): number {
    return 0; // spans the clip's duration, no intrinsic keyframe length
  }

  revolution(): number | undefined {
    return this.isPureSpin ? Math.max(1, Math.round(360 / Math.abs(this.spinDegPerTick))) : undefined;
  }

  period(duration: number): number {
    const rev = this.revolution();
    return rev ?? Math.max(1, duration);
  }

  emitFrame(ctx: FunctionContext, f: number, period: number, duration: number): void {
    // Spin angle: a pure spin steps by the exact revolution increment (so it loops
    // seamlessly); a spin combined with a ramp uses its raw per-tick speed.
    const rev = this.revolution();
    const angle =
      this.spinAxis === undefined
        ? 0
        : rev !== undefined
          ? f * (360 / rev) * Math.sign(this.spinDegPerTick)
          : f * this.spinDegPerTick;
    const q = this.spinAxis ? quat(this.spinAxis, angle) : IDENTITY_QUAT;
    // Ramp progress 0..1 across the played duration (move/scale only).
    const u = duration <= 1 ? 1 : f / (duration - 1);

    for (const m of this.target.members) {
      const moved: Vec3 = this.moveDelta
        ? [
            m.translation[0] + this.moveDelta[0] * u,
            m.translation[1] + this.moveDelta[1] * u,
            m.translation[2] + this.moveDelta[2] * u,
          ]
        : m.translation;
      const translation = this.spinAxis ? rotateAboutPivot(moved, this.target.pivot, q) : moved;
      const scale = this.scaleTo ? lerpVec3(m.scale, this.scaleTo, u) : m.scale;
      const left = this.spinAxis ? q : m.leftRotation;
      ctx.data().merge().entity(m.selector, transformNbt(translation, scale, left, 1));
    }
  }

  emitSmooth(ctx: FunctionContext, duration: number, reverse: boolean): void {
    for (const m of this.target.members) {
      const translation: Vec3 =
        reverse || !this.moveDelta
          ? m.translation
          : [
              m.translation[0] + this.moveDelta[0],
              m.translation[1] + this.moveDelta[1],
              m.translation[2] + this.moveDelta[2],
            ];
      const scale = reverse ? m.scale : this.scaleTo ?? m.scale;
      const left = reverse ? m.leftRotation : this.rotateToQ ?? m.leftRotation;
      ctx.data().merge().entity(m.selector, transformNbt(translation, scale, left, duration));
    }
  }
}

/** A leaf value a generic NBT track interpolates: a number or a 3-vector. */
export type NbtValue = number | Vec3;

/**
 * Animates an arbitrary NBT path on an arbitrary selector over keyframes - e.g.
 * a scoreboard-free way to drive any merge-able numeric field. Always baked.
 */
export class NbtTrack implements Track {
  readonly mode: TrackMode = "frame";

  constructor(
    private readonly selector: Selector,
    private readonly path: string,
    private readonly keys: readonly Keyframe<NbtValue>[],
  ) {
    if (keys.length === 0) throw new Error("nbt track needs at least one keyframe.");
  }

  empty(): boolean {
    return false;
  }
  length(): number {
    return this.keys[this.keys.length - 1].tick;
  }
  period(duration: number): number {
    return Math.max(1, duration);
  }
  revolution(): undefined {
    return undefined;
  }

  emitFrame(ctx: FunctionContext, f: number): void {
    const v = sample(this.keys, f, mixNbt);
    const leaf = typeof v === "number" ? Float(round6(v)) : (v as Vec3).map((n) => Float(round6(n)));
    ctx.data().merge().entity(this.selector, Nbt(nest(this.path, leaf)));
  }

  emitSmooth(): void {
    throw new Error("NbtTrack is frame-only.");
  }
}

function mixNbt(a: NbtValue, b: NbtValue, u: number): NbtValue {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  return lerpVec3(a as Vec3, b as Vec3, u);
}

/**
 * Teleports a selector along a positional path over keyframes - a camera dolly or
 * any entity move. Always baked (one `tp` per tick).
 */
export class TpTrack implements Track {
  readonly mode: TrackMode = "frame";

  constructor(
    private readonly selector: Selector,
    private readonly keys: readonly Keyframe<Vec3>[],
  ) {
    if (keys.length === 0) throw new Error("tp track needs at least one keyframe.");
  }

  empty(): boolean {
    return false;
  }
  length(): number {
    return this.keys[this.keys.length - 1].tick;
  }
  period(duration: number): number {
    return Math.max(1, duration);
  }
  revolution(): undefined {
    return undefined;
  }

  emitFrame(ctx: FunctionContext, f: number): void {
    const p = sampleVec3(this.keys, f);
    // `teleport <targets> <location>` isn't accepted by the command grammar, so
    // run a location-only teleport in the selector's `as` context instead:
    // `execute as <sel> run teleport <x y z>`.
    this.selector.run((c) => c.teleport(undefined, Pos(p[0], p[1], p[2])))(ctx);
  }

  emitSmooth(): void {
    throw new Error("TpTrack is frame-only.");
  }
}
