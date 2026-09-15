/**
 * The pack's difficulty level: one score the pack owns, seeded from `/difficulty` on first load.
 *
 * twine only stores the level and dispatches on it; what each level changes is written by hand.
 *
 *   // sword.difficulty.ts
 *   export default defineDifficulty({ easy: { hitDamage: 3 }, medium: { hitDamage: 6 }, hard: { hitDamage: 9 } });
 *
 *   // setting it
 *   onLoad() { setDifficulty("hard"); }
 *   dp.createFunction("difficulty/easy").build(() => setDifficulty("easy"));
 *   // in game: /scoreboard players set #level twine.difficulty 3
 *
 *   // reading it
 *   mob.byDifficulty(ctx, (c, level) => c.damage(Selector.nearest(), config[level].hitDamage));
 *   when: (c) => c.unlessScoreMatches(DIFFICULTY, Range.exactly(DIFFICULTY_IDS.easy))
 */
import { Objective, ScoreTarget } from "helix";
import type { Score } from "helix";

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
export const DIFFICULTY: Score = new Objective("twine.difficulty").score(
  ScoreTarget("#level"),
);

/** Sets the pack's difficulty level, in the ambient function. */
export const setDifficulty = (level: Difficulty): void => {
  DIFFICULTY.set(DIFFICULTY_IDS[level]);
};

/** Types a difficulty config. Every level must be listed, so nothing falls back silently. */
export const defineDifficulty = <T>(
  config: Record<Difficulty, T>,
): Record<Difficulty, T> => config;
