import type { Id } from "../../id";

/** A score bound in `entity_scores`: an exact int or an inclusive `{min,max}`. */
export type ScoreBound = number | { min?: number; max?: number };

/** A 1-D inclusive bound: an exact value or `{min,max}`. */
export type Bound = number | { min?: number; max?: number };

/** One id, a tag (`#...`), or a list of ids. Lists need 1.20.5+ in most fields. */
export type IdList = string | Id | (string | Id)[];

/** Which entity in the evaluation context a check runs against. */
export type EntityTarget =
  | "this"
  | "killer"
  | "direct_killer"
  | "killer_player"
  | "attacker"
  | (string & {});

/** JSON object Minecraft reads as one predicate condition. */
export type PredicateJson = Record<string, unknown>;
