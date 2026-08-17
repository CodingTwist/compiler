/**
 * A `Clip` is a named timeline of {@link Track}s on a datapack. It compiles to a
 * set of functions and is driven by one of:
 *
 *   - **`play(ctx)` / `reverse(ctx)`** - one-shot, schedule-driven, self-contained
 *     (the door open/close motion). Generalises the old `Clip.playAt` / `Slide`.
 *   - **`loop(ctx)` + `start(ctx)`/`stop(ctx)`** - a continuous, scoreboard-timed
 *     tick run (a forever-spinning cog). Generalises the old `DisplayEffect`.
 *
 * The clip is wholly *smooth* (one native-interpolation merge per member that
 * Minecraft tweens) or *frame* (per-tick functions the driver cycles); it picks
 * the mode from its tracks and rejects a mix (compose those as separate clips or a
 * {@link Cutscene}). Compilation is deferred to `dp.onFinalize`, so timing/snap
 * chained after the motion still applies.
 */
import {
  FOREVER,
  FunctionId,
  FunctionNode,
  ScoreTarget,
  Time,
  privateName,
} from "helix";
import type {
  Datapack,
  DisplayValue,
  FunctionContext,
  Countdown,
  Vec3,
  Quat,
  Axis,
  Selector,
} from "helix";
import { modelTarget } from "./targets";
import { NbtTrack, TpTrack, TransformTrack, type NbtValue, type Track } from "./track";
import { secondsToTicks } from "./time";
import type { Keyframe } from "./value";

type Emit = (ctx: FunctionContext) => void;

export class Clip {
  private readonly tracks: Track[] = [];
  private readonly primary?: TransformTrack;
  private readonly events = new Map<number, Emit[]>();
  private durationTicks?: number;
  private snapDeg?: number;
  private emitted = false;

  // Which drivers the author wired - compile() only generates the machinery used,
  // so a play-only clip never emits a per-tick loop driver.
  private usedPlay = false;
  private usedReverse = false;
  private usedTick = false;

  // The author-facing label (the display's name) - used only in error messages.
  private readonly label: string;
  // Where this clip's generated functions live: tucked under the private root so
  // baked frames/play/reverse sort away from authored functions. The display
  // entity is still targeted by its own tag (built from the model), not by this.
  private readonly name: string;

  constructor(
    private readonly dp: Datapack,
    label: string,
    primary?: DisplayValue,
  ) {
    this.label = label;
    this.name = privateName(label);
    if (primary) {
      this.primary = new TransformTrack(modelTarget(primary));
      this.tracks.push(this.primary);
    }
    this.dp.onFinalize(() => this.compile());
  }

  // --- primary-track sugar (so `dp.clip(model).move(...).spin(...)` reads well) -
  private prim(): TransformTrack {
    if (!this.primary) {
      throw new Error(`Clip "${this.label}" has no primary model track; use .track()/.nbt()/.tp().`);
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
    this.tracks.push(t);
    return t;
  }
  /** Animate an arbitrary NBT path on `selector` over keyframes (baked). */
  nbt(selector: Selector, path: string, keys: readonly Keyframe<NbtValue>[]): this {
    this.tracks.push(new NbtTrack(selector, path, keys));
    return this;
  }
  /**
   * Teleport `selector` along a positional path over keyframes - camera/entity
   * dolly. `glide` teleports only on the keyframes and lets the client tween
   * between them via `teleport_duration` (display entities only) - far fewer
   * commands, and smoother than the per-tick default.
   */
  tp(selector: Selector, keys: readonly Keyframe<Vec3>[], glide = false): this {
    this.tracks.push(new TpTrack(selector, keys, glide));
    return this;
  }

  // --- duration / snap / events ------------------------------------------------
  /** Run for this many ticks. */
  over(ticks: number): this {
    if (!(ticks > 0)) throw new Error(`clip duration must be > 0 ticks (got ${ticks}).`);
    this.durationTicks = Math.round(ticks);
    return this;
  }
  /** Run for this many seconds. */
  forSeconds(seconds: number): this {
    return this.over(secondsToTicks(seconds));
  }
  /**
   * Make a spin come to rest on a multiple of `degrees` (default 90 - never
   * mid-tooth). Nudges the played duration so the resting frame lands on a snap
   * angle. Pure-spin clips only; the spin speed must divide `degrees` evenly.
   */
  snap(degrees = 90): this {
    if (!(degrees > 0)) throw new Error(`snap degrees must be > 0 (got ${degrees}).`);
    this.snapDeg = degrees;
    return this;
  }
  /** Run `cb`'s commands at absolute tick `tick` (sound, particle, title, anything). */
  at(tick: number, cb: Emit): this {
    if (!(tick >= 0)) throw new Error(`event tick must be >= 0 (got ${tick}).`);
    const t = Math.round(tick);
    (this.events.get(t) ?? this.events.set(t, []).get(t)!).push(cb);
    return this;
  }

  // --- drivers -----------------------------------------------------------------
  /** Play the clip forward from a function body (`afterTicks` delays the start). */
  play(ctx: FunctionContext, afterTicks = 0): void {
    this.usedPlay = true;
    this.call(ctx, "play", afterTicks);
  }
  /** Play the clip backward (door close; spin wind-back). */
  reverse(ctx: FunctionContext, afterTicks = 0): void {
    this.usedReverse = true;
    this.call(ctx, "reverse", afterTicks);
  }
  /** Start a continuous, tick-driven run (forever unless a duration was set). */
  loop(ctx: FunctionContext): void {
    this.usedTick = true;
    ctx.emit(new FunctionNode(`${this.name}/start`));
  }
  /** Begin (or restart) a timed tick-driven run (`afterTicks` staggers it). */
  start(ctx: FunctionContext, afterTicks = 0): void {
    this.usedTick = true;
    this.call(ctx, "start", afterTicks);
  }
  /** Halt a tick-driven run. */
  stop(ctx: FunctionContext): void {
    this.usedTick = true;
    ctx.emit(new FunctionNode(`${this.name}/stop`));
  }

  /** Tick count `play` would schedule (for a {@link Cutscene} to offset). */
  playLength(): number {
    return this.resolved().duration;
  }

  /** Ensure the functions a {@link Cutscene} schedules get generated. */
  markForCutscene(): void {
    this.usedPlay = true;
  }

  /**
   * Emit this clip's whole timeline into `ctx`, offset by `baseTick` - a
   * {@link Cutscene} calls this from its master schedule. Smooth clips kick off
   * their single native tween at the offset; frame clips fan their frames out.
   */
  scheduleInto(ctx: FunctionContext, baseTick: number): void {
    const { duration, mode, period: P } = this.resolved();
    const ns = this.dp.name;
    if (mode === "smooth") {
      if (baseTick <= 0) ctx.emit(new FunctionNode(`${this.name}/play`));
      else ctx.schedule().function_(FunctionId(`${ns}:${this.name}/play`), Time(baseTick));
      return;
    }
    for (let t = 0; t < duration; t++) {
      const at = baseTick + t;
      const id = FunctionId(`${ns}:${this.name}/frame_${t % P}`);
      if (at <= 0) ctx.emit(new FunctionNode(`${this.name}/frame_${t % P}`));
      else ctx.schedule().functionAppend(id, Time(at));
    }
  }

  private call(ctx: FunctionContext, which: string, afterTicks: number): void {
    const id = `${this.name}/${which}`;
    if (afterTicks > 0) {
      ctx.schedule().function_(FunctionId(`${this.dp.name}:${id}`), Time(afterTicks));
    } else {
      ctx.emit(new FunctionNode(id));
    }
  }

  // --- compilation -------------------------------------------------------------
  /** Resolve the clip's duration, mode, and frame period (memoised). */
  private _resolved?: { duration: number; mode: "smooth" | "frame"; period: number; cycling: boolean };
  private active(): Track[] {
    return this.tracks.filter((t) => !t.empty());
  }

  private resolved() {
    if (this._resolved) return this._resolved;
    const tracks = this.active();
    if (tracks.length === 0) throw new Error(`Clip "${this.label}" has no tracks.`);

    const modes = new Set(tracks.map((t) => t.mode));
    if (modes.has("smooth") && modes.has("frame")) {
      throw new Error(
        `Clip "${this.label}" mixes a native-tween track with a baked one - split them ` +
          `into separate clips (or a Cutscene).`,
      );
    }
    const mode = modes.has("frame") ? "frame" : "smooth";

    const maxLen = Math.max(0, ...tracks.map((t) => t.length()));
    const pureSpinRev = tracks.length === 1 ? tracks[0].revolution() : undefined;
    let duration =
      this.durationTicks ?? (maxLen > 0 ? maxLen : pureSpinRev ?? 20);
    duration = Math.max(duration, maxLen, 1);

    // A pure spin can cycle one revolution's worth of frames (loop-capable);
    // events pin absolute ticks, so they force a full, non-cycling bake.
    const cycling = mode === "frame" && pureSpinRev !== undefined && this.events.size === 0;
    if (this.snapDeg !== undefined && pureSpinRev !== undefined) {
      duration = this.snapDuration(duration, pureSpinRev);
    }
    const period = cycling ? pureSpinRev! : duration;
    this._resolved = { duration, mode, period, cycling };
    return this._resolved;
  }

  private compile(): void {
    if (this.emitted) return;
    this.emitted = true;
    const { mode } = this.resolved();
    if (mode === "smooth") this.compileSmooth();
    else this.compileFrames();
  }

  private compileSmooth(): void {
    const { duration } = this.resolved();
    const tracks = this.active();
    if (this.usedPlay || this.usedTick) {
      this.dp.createFunction(`${this.name}/play`).build((ctx) => {
        tracks.forEach((t) => t.emitSmooth(ctx, duration, false));
        this.scheduleEvents(ctx);
      });
    }
    if (this.usedReverse) {
      this.dp.createFunction(`${this.name}/reverse`).build((ctx) => {
        tracks.forEach((t) => t.emitSmooth(ctx, duration, true));
      });
    }
  }

  private compileFrames(): void {
    const { duration, period: P, cycling } = this.resolved();

    const tracks = this.active();
    // frame_0..frame_{P-1}: every track's contribution, plus any events on that tick.
    for (let f = 0; f < P; f++) {
      this.dp.createFunction(`${this.name}/frame_${f}`).build((ctx) => {
        tracks.forEach((t) => t.emitFrame(ctx, f, P, duration));
        this.events.get(f)?.forEach((cb) => cb(ctx));
      });
    }

    const ns = this.dp.name;
    const frame = (k: number) => FunctionId(`${ns}:${this.name}/frame_${k}`);

    if (this.usedPlay) {
      this.dp.createFunction(`${this.name}/play`).build((ctx) => {
        ctx.emit(new FunctionNode(`${this.name}/frame_0`));
        for (let t = 1; t < duration; t++) {
          ctx.schedule().functionAppend(frame(t % P), Time(t));
        }
      });
    }
    if (this.usedReverse) {
      // Wind back: start on the rest frame and step backwards, landing on frame_0.
      const rest = ((duration - 1) % P + P) % P;
      const rev = (t: number) => ((rest - t) % P + P) % P;
      this.dp.createFunction(`${this.name}/reverse`).build((ctx) => {
        ctx.emit(new FunctionNode(`${this.name}/frame_${rest}`));
        for (let t = 1; t < duration; t++) {
          ctx.schedule().functionAppend(frame(rev(t)), Time(t));
        }
      });
    }
    if (this.usedTick) {
      this.emitTickDriver(P, cycling ? FOREVER : duration);
    }
  }

  /** The continuous tick driver (loop/start/stop), timed via `dp.timing`. */
  private emitTickDriver(P: number, runTicks: number): void {
    const name = this.name; // function paths (under the private root)
    // Scoreboard fake-player holder stays the author label - not the slashed
    // function path - so the counter reads `cog`, not `zzz/cog`.
    const holder = this.label;
    const frame = this.dp.objective("anim").score(ScoreTarget(holder));
    const life: Countdown = { objective: this.dp.objective("anim_life"), holder };
    const timing = this.dp.timing;

    this.dp.createFunction(`${name}/start`).build((ctx) => {
      frame.set(0, ctx);
      timing.start(ctx, life, runTicks);
    });
    this.dp.createFunction(`${name}/stop`).build((ctx) => {
      timing.stop(ctx, life);
    });
    this.dp.createFunction(`${name}/step`).build((ctx) => {
      for (let k = 0; k < P; k++) {
        ctx.if(frame.equal(k), (c) => c.emit(new FunctionNode(`${name}/frame_${k}`)));
      }
      frame.add(1, ctx);
      ctx.if(frame.equal(P), (c) => frame.set(0, c));
      timing.advance(ctx, life);
    });
    this.dp.createFunction(`${name}/tick`, "tick").build((ctx) => {
      ctx.if(timing.active(life), (c) => c.emit(new FunctionNode(`${name}/step`)));
    });
  }

  /** Schedule timeline events for the smooth (frameless) path. */
  private scheduleEvents(ctx: FunctionContext): void {
    for (const [tick, cbs] of this.events) {
      if (tick === 0) {
        cbs.forEach((cb) => cb(ctx));
      } else {
        const id = `${this.name}/event_${tick}`;
        this.dp.createFunction(id).build((c) => cbs.forEach((cb) => cb(c)));
        ctx.schedule().function_(FunctionId(`${this.dp.name}:${id}`), Time(tick));
      }
    }
  }

  /**
   * Nudge `duration` so a spin's resting frame `(duration-1) mod N` lands on a
   * multiple of `snapDeg`. Ported from the old `Clip.snapDuration`.
   */
  private snapDuration(duration: number, N: number): number {
    const framesPerSnap = (this.snapDeg! * N) / 360;
    if (!Number.isInteger(framesPerSnap) || framesPerSnap <= 0 || N % framesPerSnap !== 0) {
      throw new Error(
        `snap(${this.snapDeg}) doesn't divide the spin evenly (${360 / N}°/frame). Use a ` +
          `snap that's a multiple of the per-frame step.`,
      );
    }
    const rest = ((duration - 1) % N + N) % N;
    const snapped = Math.round(rest / framesPerSnap) * framesPerSnap;
    return Math.max(1, duration + (snapped - rest));
  }
}
