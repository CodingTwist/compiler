import { Pos, Range, privateName } from "helix";
import type { FunctionContext, FunctionRef } from "helix";
import { byDifficulty as dispatchDifficulty, type Difficulty } from "../../difficulty";
import type { MobParts } from "./parts";

/** Emits `<mob>/summon` */
export function registerSummon<S extends string>(
  m: MobParts<S>,
): void {
  const fresh = `${m.name}.new`;
  m.add(
    "summon",
    m.fn(`${m.name}/summon`, (ctx) => {
      // Summoned separately and mounted, so the same rig can ride any mob.
      ctx.summon(m.def.nbt.tagged(m.name, fresh), Pos.rel(0, 0, 0));
      // Just summoned here, so `..1` keeps the scans to nearby chunks.
      const here = Range.atMost(1);
      m.rig.summonOn(ctx, () => m.mobs.tag(fresh).distance(here).limit(1), onDifficultyFn(m));
      ctx.tag().remove(m.mobs.tag(fresh).distance(here), fresh);
    }),
  );
}

/** `<mob>/on_difficulty`: the author's {@link MobDef.onDifficulty} for the current level, registered once. */
export function onDifficultyFn<S extends string>(
  m: MobParts<S>,
): FunctionRef | undefined {
  const body = m.def.onDifficulty;
  if (!body) return undefined;
  if (!m.fns.has("on_difficulty"))
    m.add(
      "on_difficulty",
      byDifficulty(m, "on_difficulty", (c, level) => body(c, m.dp, level)),
    );
  return m.fns.get("on_difficulty");
}

/** `<mob>/zzz/<short>`: runs `body` for the pack's difficulty level, built once per level. */
export function byDifficulty<S extends string>(
  m: MobParts<S>,
  short: string,
  body: (ctx: FunctionContext, level: Difficulty) => void,
): FunctionRef {
  return dispatchDifficulty(m.dp, privateName(`${m.name}/${short}`), body);
}
