import { Range, ScoreTarget, Selector } from "helix";
import type { FunctionContext } from "helix";
import { DIFFICULTY } from "../../difficulty";
import type { MobParts } from "./parts";
import { onDifficultyFn } from "./summon";

/** `<mob>/wake`: tag the mobs worth running, count them, and sweep orphaned rigs. */
export function wakeBody<S extends string>(
  m: MobParts<S>,
  ctx: FunctionContext,
): void {
  const self = Selector.self();
  // Stay awake while a gesture's or state's clock runs, so walking away can't freeze it halfway.
  const clocks = m.def.gestures
    .filter((g) => g.cooldown !== 0)
    .map((g) => m.cooldowns.get(g.name)!);
  if (m.stateClockObj) clocks.push(m.stateClockObj);
  const finish = clocks.length
    ? m.internal("wake_finish", (c) => {
        c.tag().add(self, m.finishingTag);
        c.tag().add(self, m.awakeTag);
      })
    : undefined;
  // Mark-and-sweep orphaned rigs: live mobs clear their rig's mark, and anything still marked is removed.
  // ponytail: runs once a second, so a dead mob's rig can linger up to a second.
  m.rig.markOrphans(ctx);
  // One scan to reset every mob (and claim its rig), then one per player for the ones near it.
  const one = m.internal("wake_one", (c) => {
    c.tag().remove(self, m.awakeTag);
    c.tag().remove(self, m.finishingTag);
    m.rig.claim(c);
    // ponytail: one line per clock - fine at a handful; a shared "busy" score if a mob grows many.
    for (const obj of clocks) {
      c.execute()
        .ifScoreMatches(obj.score(self), Range.atLeast(1))
        .run((b) => b.call(finish!));
    }
  });
  const near = m.internal("wake_near", (c) => {
    c.tag().add(self, m.awakeTag);
    c.tag().remove(self, m.finishingTag);
  });
  ctx
    .execute()
    .as(m.mobs)
    .run((b) => b.call(one));
  if (m.def.onDifficulty) watchDifficulty(m, ctx);
  ctx
    .execute()
    .at(Selector.allPlayers())
    .as(m.mobs.distance(Range.atMost(m.def.wakeRange)))
    .run((b) => b.call(near));
  ctx
    .execute()
    .storeResultScore(m.awakeObj.score(ScoreTarget("#awake")))
    .ifEntity(m.mobs.tag(m.awakeTag))
    .done();
  // Rigs no mob claimed above lost their mob.
  m.rig.sweep(ctx);
}

/** Reruns `on_difficulty` on every live mob when the pack's difficulty changed since last applied. */
function watchDifficulty<S extends string>(
  m: MobParts<S>,
  ctx: FunctionContext,
): void {
  const applied = m.awakeObj.score(ScoreTarget("#applied"));
  const rescale = m.internal("rescale", (c) => {
    c.execute()
      .as(m.mobs)
      .run((b) => b.call(onDifficultyFn(m)!));
    applied.assign(DIFFICULTY, c);
  });
  ctx
    .execute()
    .unlessScore(DIFFICULTY, "=", applied)
    .run((b) => b.call(rescale));
}
