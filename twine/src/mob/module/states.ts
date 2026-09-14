import { Range, ScoreTarget, Selector } from "helix";
import type { Datapack } from "helix";
import type { MobStates } from "../builder";
import type { MobParts } from "./parts";
import { byDifficulty } from "./summon";

/** The `mob` handle every author body gets: state switches, the state clock and `byDifficulty`. */
export function stateHandle<S extends string>(m: MobParts<S>): MobStates<S> {
  return {
    enter: (ctx, s) => ctx.call(m.fnRef(`enter/${s}`)),
    leave: () => m.stateObj.score(Selector.self()).set(0),
    byDifficulty: (ctx, body) => ctx.call(byDifficulty(m, `by_difficulty_${m.byDifficultyCalls++}`, body)),
    get clock() {
      if (!m.stateClockObj) throw new Error(`Mob "${m.name}" has no states - declare them with .states() to use the clock.`);
      return m.stateClockObj.score(Selector.self());
    },
  };
}

/** Emits `<mob>/enter/<s>`, `<mob>/state/<s>` (and `/done` if timed), and the `<mob>/state` dispatch. */
export function registerStates<S extends string>(m: MobParts<S>, dp: Datapack): void {
  if (!m.def.states.size) return;
  const state = m.stateObj.score(Selector.self());
  const clock = m.stateClockObj!.score(Selector.self());
  const cases = [...m.def.states].map(([s, def], i) => {
    const idx = i + 1;
    m.fnRef(`enter/${s}`).build((ctx) => {
      state.set(idx);
      // Zeroed for an untimed state too, or a stale count would keep the mob awake in it.
      clock.set(def.polls ?? 0);
      def.onEnter?.(ctx, dp, m.handle);
    });
    const done =
      def.polls === undefined
        ? undefined
        : m.internal(`state/${s}/done`, (ctx) => {
            def.onDone?.(ctx, dp, m.handle);
            if (def.then) m.handle.enter(ctx, def.then);
            else m.handle.leave(ctx);
          });
    const body = m.internal(`state/${s}`, (ctx) => {
      if (done) clock.remove(1);
      def.tick?.(ctx, dp, m.handle);
      // Still in this state: a tick that already switched keeps its switch.
      if (done) {
        ctx
          .execute()
          .ifScoreMatches(state, Range.exactly(idx))
          .ifScoreMatches(clock, Range.atMost(0))
          .run((b) => b.call(done));
      }
    });
    return { range: Range.exactly(idx), fn: body };
  });
  if (cases.length === 1) {
    m.add("state", cases[0].fn);
    return;
  }
  // Dispatch on a copy, so a state that enters a later state doesn't also run it this poll.
  const current = m.stateObj.score(ScoreTarget(`#${m.name}_state`));
  m.add(
    "state",
    m.internal("state", (ctx) => {
      current.assign(state, ctx);
      ctx.dispatchScore(current, cases);
    }),
  );
}
