import { Range, Relation, ScoreTarget, Selector, privateName } from "helix";
import type { FunctionContext } from "helix";
import type { ModuleScope } from "../../core/module.interface";
import { DIFFICULTY } from "../../core/difficulty";
import type { MobParts } from "./parts";
import { onDifficultyFn } from "./summon";

/** `<mob>/wake`: tag the mobs worth running, count them, and sweep orphaned rigs. */
export function wakeBody<S extends string>(m: MobParts<S>, ctx: FunctionContext, scope: ModuleScope): void {
  const self = Selector.self();
  const orphan = `${m.name}.orphan`;
  // Stay awake while a gesture's or state's clock runs, so walking away can't freeze it halfway.
  const clocks = m.def.gestures.filter((g) => g.cooldown !== 0).map((g) => m.cooldowns.get(g.name)!);
  if (m.stateClockObj) clocks.push(m.stateClockObj);
  const finish = clocks.length
    ? m.internal("wake_finish", (c) => {
        c.tag().add(self, m.finishingTag);
        c.tag().add(self, m.awakeTag);
      })
    : undefined;
  // Mark-and-sweep orphaned rigs: live mobs clear their rig's mark, and anything still marked is removed.
  // ponytail: runs once a second, so a dead mob's rig can linger up to a second.
  ctx.tag().add(m.rigRoots, orphan);
  // One scan to reset every mob (and claim its rig), then one per player for the ones near it.
  const one = m.internal("wake_one", (c) => {
    c.tag().remove(self, m.awakeTag);
    c.tag().remove(self, m.finishingTag);
    c.execute().on(Relation.PASSENGERS).run((b) => b.tag().remove(Selector.self(), orphan));
    // ponytail: one line per clock - fine at a handful; a shared "busy" score if a mob grows many.
    for (const obj of clocks) {
      c.execute().ifScoreMatches(obj.score(self), Range.atLeast(1)).run((b) => b.call(finish!));
    }
  });
  const near = m.internal("wake_near", (c) => {
    c.tag().add(self, m.awakeTag);
    c.tag().remove(self, m.finishingTag);
  });
  ctx.execute().as(m.mobs).run((b) => b.call(one));
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
  // Rigs no mob claimed above lost their mob: kill them, passengers first, since killing a
  // vehicle only dismounts its riders.
  const killRig = scope.fn(privateName(`${m.name}/kill_rig`), (c) => {
    c.execute().on(Relation.PASSENGERS).run((b) => b.kill(Selector.self()));
    c.kill(Selector.self());
  });
  ctx
    .execute()
    .as(m.rigRoots.tag(orphan))
    .run((b) => b.call(killRig));
  m.awakeObj.score(ScoreTarget("#wake")).set(0);
}

/** Reruns `on_difficulty` on every live mob when the pack's difficulty changed since last applied. */
function watchDifficulty<S extends string>(m: MobParts<S>, ctx: FunctionContext): void {
  const applied = m.awakeObj.score(ScoreTarget("#applied"));
  const rescale = m.internal("rescale", (c) => {
    c.execute().as(m.mobs).run((b) => b.call(onDifficultyFn(m)!));
    applied.assign(DIFFICULTY, c);
  });
  ctx.execute().unlessScore(DIFFICULTY, "=", applied).run((b) => b.call(rescale));
}
