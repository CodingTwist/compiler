/**
 * A `Cutscene` composes {@link Clip}s on one shared timeline - each added at a
 * tick offset - plus its own timeline events (camera moves, sound, titles). It
 * compiles to a single master function: `play(ctx)` fans every sub-clip's frames
 * and every event out on the master schedule, so a whole scripted sequence fires
 * from one call.
 *
 *   const intro = dp.cutscene("intro")
 *     .add(doorOpen, { at: 0 })
 *     .add(camPan,   { at: 0 })
 *     .at(40, (c) => c.playsound(...))
 *     .add(doorClose, { at: 200 });
 *   dp.createFunction("start_intro").build((ctx) => intro.play(ctx));
 */
import { FunctionId, FunctionNode, Time, privateName } from "helix";
import type { Datapack, FunctionContext, Selector, Vec3 } from "helix";
import { Clip } from "./clip";
import type { Keyframe } from "./value";

type Emit = (ctx: FunctionContext) => void;

export class Cutscene {
  private readonly entries: { clip: Clip; at: number }[] = [];
  private readonly events = new Map<number, Emit[]>();
  private camSeq = 0;
  // Generated functions live under the private root (the child cam clips nest
  // beneath it; their own privateName() call is idempotent so it never doubles up).
  private readonly name: string;

  constructor(
    private readonly dp: Datapack,
    name: string,
  ) {
    this.name = privateName(name);
  }

  /** Place `clip` on the master timeline starting at tick `at` (default 0). */
  add(clip: Clip, opts: { at?: number } = {}): this {
    clip.markForCutscene();
    this.entries.push({ clip, at: Math.max(0, Math.round(opts.at ?? 0)) });
    return this;
  }

  /** Run `cb`'s commands at master tick `tick` (sound, title, anything). */
  at(tick: number, cb: Emit): this {
    const t = Math.max(0, Math.round(tick));
    (this.events.get(t) ?? this.events.set(t, []).get(t)!).push(cb);
    return this;
  }

  /**
   * Dolly `viewer` (usually the spectating player) along a positional path,
   * starting at tick `at`. Sugar for a `tp` clip added to the timeline. Assumes a
   * spectator-style camera for the target version.
   */
  camera(viewer: Selector, keys: readonly Keyframe<Vec3>[], opts: { at?: number } = {}): this {
    const cam = new Clip(this.dp, `${this.name}/cam_${this.camSeq++}`).tp(viewer, keys);
    return this.add(cam, opts);
  }

  /** Emit the master schedule that drives the whole sequence. */
  play(ctx: FunctionContext): void {
    this.dp.createFunction(`${this.name}/play`).build((c) => {
      this.entries.forEach((e) => e.clip.scheduleInto(c, e.at));
      for (const [tick, cbs] of this.events) {
        if (tick === 0) {
          cbs.forEach((cb) => cb(c));
        } else {
          const id = `${this.name}/event_${tick}`;
          this.dp.createFunction(id).build((ec) => cbs.forEach((cb) => cb(ec)));
          c.schedule().function_(FunctionId(`${this.dp.name}:${id}`), Time(tick));
        }
      }
    });
    ctx.emit(new FunctionNode(`${this.name}/play`));
  }
}
