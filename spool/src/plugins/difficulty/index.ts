/**
 * The pack's difficulty level: one score the pack owns, seeded from `/difficulty` on first load.
 *
 * Only stores the level and dispatches on it; what each level changes is written by hand.
 *
 *   // sword.difficulty.ts
 *   export default defineDifficulty({ easy: { hitDamage: 3 }, medium: { hitDamage: 6 }, hard: { hitDamage: 9 } });
 *
 *   difficulty(dp);                                   // creates and seeds the score, once per pack
 *   dp.public("difficulty/easy").build(() => setDifficulty("easy"));
 *   // in game: /scoreboard players set #level twine.difficulty 3
 *
 *   ctx.call(byDifficulty(dp, "hit", (c, level) => c.damage(Selector.nearest(), config[level].hitDamage)));
 *   when: (c) => c.unlessScoreMatches(DIFFICULTY, Range.exactly(DIFFICULTY_IDS.easy))
 */
import { Datapack, Objective, Range, ScoreTarget } from "helix";
import type { FunctionContext, FunctionRef, Score } from "helix";

/** A difficulty level. `medium` is vanilla's `normal`. */
export type Difficulty = "easy" | "medium" | "hard";

/** Every level, lowest first. */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

/** The score value for each level, matching the `/difficulty` query result. */
export const DIFFICULTY_IDS: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

/** The pack's difficulty level score, `#level twine.difficulty`. */
// Named for twine, where it started, so existing worlds keep their level.
export const DIFFICULTY: Score = new Objective("twine.difficulty").score(ScoreTarget("#level"));

/** Sets the pack's difficulty level, in the ambient function. */
export const setDifficulty = (level: Difficulty): void => {
  DIFFICULTY.set(DIFFICULTY_IDS[level]);
};

/** Types a difficulty config. Every level must be listed, so nothing falls back silently. */
export const defineDifficulty = <T>(config: Record<Difficulty, T>): Record<Difficulty, T> => config;

const seeded = new WeakSet<Datapack>();

/** Creates the level score and seeds it from `/difficulty` on load while unset, once per pack. */
export function difficulty(dp: Datapack): void {
  if (seeded.has(dp)) return;
  seeded.add(dp);
  // Only while unset, so a level the pack chose survives /reload.
  dp.objective(DIFFICULTY.objective.getName());
  dp.load((ctx) =>
    ctx
      .execute()
      .unlessScoreMatches(DIFFICULTY, Range.atLeast(1))
      .storeResultScore(DIFFICULTY)
      .run((b) => b.difficulty()),
  );
}

/**
 * A function `name` that runs `body` for the current level, built once per level.
 *
 * Its own function, since the dispatch `return`s.
 */
export function byDifficulty(
  dp: Datapack,
  name: string,
  body: (ctx: FunctionContext, level: Difficulty) => void,
): FunctionRef {
  const build = (fnName: string, b: (ctx: FunctionContext) => void) => {
    const fn = dp.createFunction(fnName);
    fn.build(b);
    return fn;
  };
  const cases = DIFFICULTIES.map((level) => ({
    range: Range.exactly(DIFFICULTY_IDS[level]),
    fn: build(`${name}/${level}`, (c) => body(c, level)),
  }));
  return build(name, (c) => c.dispatchScore(DIFFICULTY, cases));
}
