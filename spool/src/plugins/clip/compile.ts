// Emits a clip's functions: the smooth play/reverse, baked frames, and the tick driver.
import { FOREVER, FunctionId, FunctionNode, ScoreTarget, Time } from "helix";
import type { Countdown, FunctionContext } from "helix";
import { activeTracks, resolve, type ClipState } from "./resolve";

/** Generates every function the clip's used drivers need. */
export function compileClip(s: ClipState): void {
  if (resolve(s).mode === "smooth") compileSmooth(s);
  else compileFrames(s);
}

function compileSmooth(s: ClipState): void {
  const { duration } = resolve(s);
  const tracks = activeTracks(s);
  if (s.usedPlay || s.usedTick) {
    s.dp.createFunction(`${s.name}/play`).build((ctx) => {
      tracks.forEach((t) => t.emitSmooth(ctx, duration, false));
      scheduleEvents(s, ctx);
    });
  }
  if (s.usedReverse) {
    s.dp.createFunction(`${s.name}/reverse`).build((ctx) => {
      tracks.forEach((t) => t.emitSmooth(ctx, duration, true));
    });
  }
}

function compileFrames(s: ClipState): void {
  const { duration, period: P, cycling } = resolve(s);

  const tracks = activeTracks(s);
  // frame_0..frame_{P-1}: every track's contribution, plus any events on that tick.
  for (let f = 0; f < P; f++) {
    s.dp.createFunction(`${s.name}/frame_${f}`).build((ctx) => {
      tracks.forEach((t) => t.emitFrame(ctx, f, P, duration));
      s.events.get(f)?.forEach((cb) => cb(ctx));
    });
  }

  const ns = s.dp.name;
  const frame = (k: number) => FunctionId(`${ns}:${s.name}/frame_${k}`);

  if (s.usedPlay) {
    s.dp.createFunction(`${s.name}/play`).build((ctx) => {
      ctx.emit(new FunctionNode(`${s.name}/frame_0`));
      for (let t = 1; t < duration; t++) {
        ctx.schedule().functionAppend(frame(t % P), Time(t));
      }
    });
  }
  if (s.usedReverse) {
    // Wind back: start on the rest frame and step backwards, landing on frame_0.
    const rest = ((duration - 1) % P + P) % P;
    const rev = (t: number) => ((rest - t) % P + P) % P;
    s.dp.createFunction(`${s.name}/reverse`).build((ctx) => {
      ctx.emit(new FunctionNode(`${s.name}/frame_${rest}`));
      for (let t = 1; t < duration; t++) {
        ctx.schedule().functionAppend(frame(rev(t)), Time(t));
      }
    });
  }
  if (s.usedTick) {
    emitTickDriver(s, P, cycling ? FOREVER : duration);
  }
}

/** The continuous tick driver (loop/start/stop), timed via `dp.timing`. */
function emitTickDriver(s: ClipState, P: number, runTicks: number): void {
  const name = s.name; // function paths (under the private root)
  // The score holder is the label, so the counter reads `cog`, not `zzz/cog`.
  const holder = s.label;
  const frame = s.dp.objective("anim").score(ScoreTarget(holder));
  const life: Countdown = { objective: s.dp.objective("anim_life"), holder };
  const timing = s.dp.timing;

  s.dp.createFunction(`${name}/start`).build((ctx) => {
    frame.set(0);
    timing.start(ctx, life, runTicks);
  });
  s.dp.createFunction(`${name}/stop`).build((ctx) => {
    timing.stop(ctx, life);
  });
  s.dp.createFunction(`${name}/step`).build((ctx) => {
    for (let k = 0; k < P; k++) {
      ctx.if(frame.equal(k), (c) => c.emit(new FunctionNode(`${name}/frame_${k}`)));
    }
    frame.add(1);
    ctx.if(frame.equal(P), (c) => frame.set(0));
    timing.advance(ctx, life);
  });
  s.dp.createFunction(`${name}/tick`, "tick").build((ctx) => {
    ctx.if(timing.active(life), (c) => c.emit(new FunctionNode(`${name}/step`)));
  });
}

/** Schedule timeline events for the smooth (frameless) path. */
function scheduleEvents(s: ClipState, ctx: FunctionContext): void {
  for (const [tick, cbs] of s.events) {
    if (tick === 0) {
      cbs.forEach((cb) => cb(ctx));
    } else {
      const id = `${s.name}/event_${tick}`;
      s.dp.createFunction(id).build((c) => cbs.forEach((cb) => cb(c)));
      ctx.schedule().function_(FunctionId(`${s.dp.name}:${id}`), Time(tick));
    }
  }
}
