// A clip's tracks, duration, snap and events: the chainable half of {@link Clip}.
import { privateName } from "helix";
import type { Datapack, DisplayValue, Vec3, Quat, Axis, Selector } from "helix";
import { modelTarget } from "./targets";
import { NbtTrack, TpTrack, TransformTrack, type NbtValue } from "./track";
import { secondsToTicks } from "./time";
import type { Keyframe } from "./value";
import { compileClip } from "./compile";
import type { ClipState, Emit } from "./resolve";

/** The setters of {@link Clip}; each returns the clip for chaining. */
export class ClipTimeline {
  private readonly primary?: TransformTrack;
  protected readonly s: ClipState;
  private emitted = false;

  constructor(dp: Datapack, label: string, primary?: DisplayValue) {
    this.s = {
      dp,
      label,
      // Generated functions live under the private root; the entity is still found by its
      // model tag.
      name: privateName(label),
      tracks: [],
      events: new Map(),
      usedPlay: false,
      usedReverse: false,
      usedTick: false,
    };
    if (primary) {
      this.primary = new TransformTrack(modelTarget(primary));
      this.s.tracks.push(this.primary);
    }
    dp.onFinalize(() => {
      if (this.emitted) return;
      this.emitted = true;
      compileClip(this.s);
    });
  }

  // --- primary-track sugar (so `dp.clip(model).move(...).spin(...)` reads well) -
  private prim(): TransformTrack {
    if (!this.primary) {
      throw new Error(`Clip "${this.s.label}" has no primary model track; use .track()/.nbt()/.tp().`);
    }
    return this.primary;
  }
  /** Translate the primary model by `delta` over the clip duration. */
  move(delta: Vec3): this {
    this.prim().move(delta);
    return this;
  }
  /** Spin the primary model about `axis` at `degPerTick` (negative reverses). */
  spin(axis: Axis, degPerTick: number): this {
    this.prim().spin(axis, degPerTick);
    return this;
  }
  /** Scale the primary model to `to` over the clip duration. */
  scaleTo(to: Vec3): this {
    this.prim().scale(to);
    return this;
  }
  /** Set the primary model's orientation to `q` over the clip duration. */
  rotateTo(q: Quat): this {
    this.prim().rotateTo(q);
    return this;
  }
  /** Force per-tick baked frames for the primary model. */
  bake(): this {
    this.prim().bake();
    return this;
  }
  /** Force the native-interpolation path for the primary model. */
  smooth(): this {
    this.prim().smooth();
    return this;
  }

  // --- additional tracks -------------------------------------------------------
  /** Add another display-model transform track (chain `.move`/`.spin`/… on it). */
  track(model: DisplayValue): TransformTrack {
    const t = new TransformTrack(modelTarget(model));
    this.s.tracks.push(t);
    return t;
  }
  /** Animate an arbitrary NBT path on `selector` over keyframes (baked). */
  nbt(selector: Selector, path: string, keys: readonly Keyframe<NbtValue>[]): this {
    this.s.tracks.push(new NbtTrack(selector, path, keys));
    return this;
  }
  /**
   * Teleports `selector` along keyframes. `glide` only teleports on keyframes and lets the
   * client
   * tween between them (display entities only): fewer commands and smoother.
   */
  tp(selector: Selector, keys: readonly Keyframe<Vec3>[], glide = false): this {
    this.s.tracks.push(new TpTrack(selector, keys, glide));
    return this;
  }

  // --- duration / snap / events ------------------------------------------------
  /** Run for this many ticks. */
  over(ticks: number): this {
    if (!(ticks > 0)) throw new Error(`clip duration must be > 0 ticks (got ${ticks}).`);
    this.s.durationTicks = Math.round(ticks);
    return this;
  }
  /** Run for this many seconds. */
  forSeconds(seconds: number): this {
    return this.over(secondsToTicks(seconds));
  }
  /**
   * Makes a spin stop on a multiple of `degrees` (default 90). Pure spins only; speed must
   * divide `degrees`.
   */
  snap(degrees = 90): this {
    if (!(degrees > 0)) throw new Error(`snap degrees must be > 0 (got ${degrees}).`);
    this.s.snapDeg = degrees;
    return this;
  }
  /** Run `cb`'s commands at absolute tick `tick` (sound, particle, title, anything). */
  at(tick: number, cb: Emit): this {
    if (!(tick >= 0)) throw new Error(`event tick must be >= 0 (got ${tick}).`);
    const t = Math.round(tick);
    (this.s.events.get(t) ?? this.s.events.set(t, []).get(t)!).push(cb);
    return this;
  }
}
