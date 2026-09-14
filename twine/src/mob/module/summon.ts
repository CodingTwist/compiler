import { Pos, Range, Relation, Selector } from "helix";
import type { FunctionContext, FunctionRef } from "helix";
import type { ModuleScope } from "../../core/module.interface";
import { DIFFICULTIES, DIFFICULTY, DIFFICULTY_IDS, type Difficulty } from "../../core/difficulty";
import type { MobParts } from "./parts";

/** Emits `<mob>/summon` */
export function registerSummon<S extends string>(m: MobParts<S>, scope: ModuleScope): void {
  const fresh = `${m.name}.new`;
  m.add(
    "summon",
    scope.fn(`${m.name}/summon`, (ctx) => {
      // Summoned separately and mounted, so the same rig can ride any mob.
      ctx.summon(m.def.nbt.tagged(m.name, fresh), Pos.rel(0, 0, 0));
      ctx.summon(m.def.model.toNbt().tagged(fresh), Pos.rel(0, 0, 0));
      // Both were just summoned here, so `..1` keeps the scans to nearby chunks.
      const here = Range.atMost(1);
      ctx
        .execute()
        .as(m.rigRoots.tag(fresh).distance(here))
        .run((b) => b.ride().mount(Selector.self(), m.mobs.tag(fresh).distance(here).limit(1)));
      const scale = onDifficultyFn(m);
      if (scale) ctx.execute().as(m.mobs.tag(fresh).distance(here).limit(1)).run((b) => b.call(scale));
      // Only the mob and the rig root carry `fresh`. The rig is reached through the mob, since
      // mounting may have moved it.
      ctx
        .execute()
        .as(m.mobs.tag(fresh).distance(here).limit(1))
        .on(Relation.PASSENGERS)
        .run((b) => b.tag().remove(Selector.self(), fresh));
      ctx.tag().remove(m.mobs.tag(fresh).distance(here), fresh);
    }),
  );
}

/** `<mob>/on_difficulty`: the author's {@link MobDef.onDifficulty} for the current level, registered once. */
export function onDifficultyFn<S extends string>(m: MobParts<S>): FunctionRef | undefined {
  const body = m.def.onDifficulty;
  if (!body) return undefined;
  if (!m.fns.has("on_difficulty")) m.add("on_difficulty", byDifficulty(m, "on_difficulty", (c, level) => body(c, m.dp, level)));
  return m.fns.get("on_difficulty");
}

/**
 * `<mob>/<short>`: runs `body` for the pack's difficulty level, built once per level.
 *
 * Its own function because the dispatch returns, which would cut off the caller's later commands.
 */
export function byDifficulty<S extends string>(
  m: MobParts<S>,
  short: string,
  body: (ctx: FunctionContext, level: Difficulty) => void,
): FunctionRef {
  const cases = DIFFICULTIES.map((level) => ({
    range: Range.exactly(DIFFICULTY_IDS[level]),
    fn: m.internal(`${short}/${level}`, (c) => body(c, level)),
  }));
  return m.internal(short, (c) => c.dispatchScore(DIFFICULTY, cases));
}
