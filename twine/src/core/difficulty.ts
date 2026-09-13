/**
 * Per-mob difficulty tables, read from the world's `/difficulty`.
 *
 *   // sword.difficulty.ts
 *   export default defineDifficulty({ easy: { damage: 0.6, off: ["whirl"] }, hard: { damage: 1.5 } });
 *
 *   defineMob(...).difficulty(swordDifficulty)
 *
 * All checked at runtime, so changing the world's difficulty applies to live mobs within a second. Damage or knockback a mob deals by command goes
 * through `mob.scaled(ctx, (c, s) => ...)` instead.
 */

/** A difficulty level. `medium` is vanilla's `normal`. */
export type Difficulty = "easy" | "medium" | "hard";

/** How one level changes a mob. Omitted fields leave it as authored. */
export interface MobScaling {
  /** Movement speed multiplier. */
  speed?: number;
  /** Attack damage multiplier. Vanilla's own difficulty damage scaling still applies on top. */
  damage?: number;
  /** Attack knockback multiplier. A mob with no base knockback stays at 0. */
  knockback?: number;
  /** Gestures whose trigger never fires at this level. */
  off?: string[];
  /** The only gestures whose triggers fire at this level: the mob's moveset. Not with {@link off}. */
  moves?: string[];
}

/**
 * A mob's scaling per level. A level left out is as authored.
 *
 * Extra fields are the author's own knobs, read in `mob.scaled` bodies as `table[s.level]`.
 */
export type DifficultyConfig = Partial<Record<Difficulty, MobScaling>>;

/** One level's resolved multipliers, handed to a `mob.scaled` body. */
export interface LevelScaling {
  level: Difficulty;
  speed: number;
  damage: number;
  knockback: number;
}

/**
 * Types a difficulty table. Name extra knobs for `mob.scaled` bodies as `X`: `defineDifficulty<{ shockwave: boolean }>(...)`.
 *
 * Every level listed must set every knob, so a body can read them without fallbacks.
 */
export const defineDifficulty = <X extends object = {}>(
  config: Partial<Record<Difficulty, MobScaling & X>>,
): Partial<Record<Difficulty, MobScaling & X>> => config;

/** The `/difficulty` query result for each level. */
export const DIFFICULTY_IDS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Resolves `level` from `config`, with unset multipliers at 1. */
export function levelScaling(config: DifficultyConfig, level: Difficulty): LevelScaling {
  const { speed = 1, damage = 1, knockback = 1 } = config[level] ?? {};
  return { level, speed, damage, knockback };
}
