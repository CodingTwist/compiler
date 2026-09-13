/**
 * Difficulty scaling for custom mobs, read from the world's `/difficulty` when a mob is summoned.
 *
 *   // difficulty.config.ts
 *   export default defineDifficulty({ easy: { speed: 0.8, damage: 0.7 }, hard: { damage: 1.5, knockback: 1 } });
 *
 *   DatapackFactory.mount(dp, AppModule, { difficulty });
 */

/** A difficulty level. `medium` is vanilla's `normal`. */
export type Difficulty = "easy" | "medium" | "hard";

/** How one level changes a mob. Omitted fields leave it as summoned. */
export interface MobScaling {
  /** Movement speed multiplier. */
  speed?: number;
  /** Attack damage multiplier. Vanilla's own difficulty damage scaling still applies on top. */
  damage?: number;
  /** Knockback added, not multiplied, since most mobs start at 0. */
  knockback?: number;
}

/** Scaling per level. A level left out is unscaled. */
export type DifficultyConfig = Partial<Record<Difficulty, MobScaling>>;

/** Types a difficulty config file. */
export const defineDifficulty = (config: DifficultyConfig): DifficultyConfig => config;

/** The `/difficulty` query result for each level. */
export const DIFFICULTY_IDS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

let resolved: DifficultyConfig = {};

/** Publish the pack-wide config. Called by `DatapackFactory.mount`; mobs read it when they register. */
export function setDifficulty(config: DifficultyConfig): void {
  resolved = config;
}

/** The pack-wide config, with `override` merged over it per level and field. */
export function difficultyFor(override: DifficultyConfig = {}): DifficultyConfig {
  const out: DifficultyConfig = {};
  for (const level of Object.keys(DIFFICULTY_IDS) as Difficulty[]) {
    const s = { ...resolved[level], ...override[level] };
    if (Object.keys(s).length) out[level] = s;
  }
  return out;
}
