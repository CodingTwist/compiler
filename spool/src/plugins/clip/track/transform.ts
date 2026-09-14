// The display-model transform track: move, scale, rotateTo and spin.
import {
  DecomposedTransformation,
  DisplayBase,
  Float,
  quat,
  rotateAboutPivot,
  round6,
} from "helix";
import type { FunctionContext, Vec3, Quat, Axis } from "helix";
import type { ModelTarget } from "../targets";
import { lerpVec3 } from "../value";
import type { Track, TrackMode } from "./types";

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

/** Build the per-member transform NBT for one baked frame. */
function transformNbt(translation: Vec3, scale: Vec3, left: Quat, interpDuration: number) {
  const f = (v: number) => Float(round6(v));
  return DisplayBase({
    // Rotations are plain lists in the schema, so they need their own `f` suffix.
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
 * Animates a display model's transform: `move`, `scale`, `rotateTo` and `spin`.
 * Spins are frame-baked; everything else tweens natively unless `.bake()` is set.
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
    // A pure spin steps by an exact fraction of a revolution so it loops seamlessly.
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
