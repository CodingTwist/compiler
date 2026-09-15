import { Range, Selector, privateName } from "helix";
import type { Datapack, FunctionContext } from "helix";
import type { ModuleScope } from "../../core/module.interface";
import type { ResolvedGesture } from "../gesture";
import type { MobParts } from "./parts";

/** Emits a gesture's raise function, its delayed bodies, and its clock. */
export function registerGesture<S extends string>(
  m: MobParts<S>,
  dp: Datapack,
  scope: ModuleScope,
  g: ResolvedGesture<S>,
): void {
  m.cooldowns.set(g.name, dp.objective(`${m.name}.${g.name}`));
  // Delayed bodies get their own function, so the tick pays one call only for mobs mid-swing.
  if (g.fireAfter) {
    m.add(
      `${g.name}_hit`,
      scope.fn(privateName(`${m.name}/${g.name}_hit`), (ctx) =>
        g.onFire?.(ctx, dp, m.handle),
      ),
    );
  }
  if (g.onRecover) {
    const body = g.onRecover;
    m.add(
      `${g.name}_recover`,
      scope.fn(privateName(`${m.name}/${g.name}_recover`), (ctx) =>
        body(ctx, dp, m.handle),
      ),
    );
  }
  m.add(
    g.name,
    scope.fn(`${m.name}/${g.name}`, (ctx) => {
      ctx.tag().add(Selector.self(), m.gestureTag(g));
      if (g.cooldown !== 0) m.cooldown(g).set(g.cooldown);
      m.poseMembers(ctx, undefined, g, g.steps[0], g.rise);
      if (!g.fireAfter) g.onFire?.(ctx, dp, m.handle);
    }),
  );
  // Cooldowns cap how often the gesture's bodies run, which the report can't see.
  if (g.when && g.cooldown >= 5) {
    for (const fn of [g.name, `${g.name}_hit`, `${g.name}_recover`]) {
      if (m.fns.has(fn))
        dp.allowNbtRead(
          m.fns.get(fn)!,
          `at most once per ${g.cooldown}-tick cooldown`,
        );
    }
  }
  // The clock-driven half runs only for a mob whose clock is running.
  if (g.cooldown !== 0) {
    const clock = m.add(
      `${g.name}_clock`,
      dp.createFunction(privateName(`${m.name}/${g.name}_clock`)),
    );
    clock.build((ctx) => clockGesture(m, ctx, g));
  }
}

/** `<mob>/<gesture>_clock`: one mob's countdown and everything timed from it. As and at the mob. */
function clockGesture<S extends string>(
  m: MobParts<S>,
  ctx: FunctionContext,
  g: ResolvedGesture<S>,
): void {
  m.cooldown(g).remove(1);
  // A beat on the clock: this mob, exactly `after` polls past its raise.
  const onBeat = (after: number, fn: string) =>
    ctx
      .execute()
      .ifScoreMatches(m.cooldown(g), Range.exactly(g.cooldown - after))
      .run((b) => b.call(m.fnRef(fn)));
  if (g.fireAfter) onBeat(g.fireAfter, `${g.name}_hit`);
  if (g.onRecover) onBeat(g.recoverAfter, `${g.name}_recover`);

  // Sequences step down their own cooldown, so each mob animates independently. Slerp takes
  // the short way, so a sequence just short of a full turn still finishes forwards.
  if (g.sequenced) {
    const later = g.schedule.slice(1);
    const cases = later.map((w, k) => ({
      range: Range.exactly(g.cooldown - w.poll),
      fn: m.internal(`${g.name}_step_${k + 1}`, (c) => {
        m.poseMembers(c, undefined, g, w.q, w.duration);
        if (k === later.length - 1)
          c.tag().remove(Selector.self(), m.gestureTag(g));
      }),
    }));
    ctx.call(
      m.internal(`${g.name}_pose`, (c) =>
        c.dispatchScore(m.cooldown(g), cases),
      ),
    );
  }
}

/** Every gesture trigger, behind one finishing check: a finishing mob fires nothing new. */
export function triggers<S extends string>(
  m: MobParts<S>,
  ctx: FunctionContext,
): void {
  const all = m.def.gestures.filter((g) => g.when);
  const fire = (c: FunctionContext, g: ResolvedGesture<S>, guard: boolean) => {
    const chain = c.execute();
    if (guard) chain.unlessEntity(Selector.self().tag(m.finishingTag));
    if (g.cooldown !== 0)
      chain.unlessScoreMatches(m.cooldown(g), Range.atLeast(1));
    g.when!(chain);
    chain.run((b) => b.call(m.fnRef(g.name)));
  };
  if (all.length === 1) {
    fire(ctx, all[0], true);
  } else if (all.length > 1) {
    const fn = m.internal("triggers", (c) =>
      all.forEach((g) => fire(c, g, false)),
    );
    ctx
      .execute()
      .unlessEntity(Selector.self().tag(m.finishingTag))
      .run((b) => b.call(fn));
  }
}
