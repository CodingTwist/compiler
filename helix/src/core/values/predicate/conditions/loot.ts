// Condition JSON builders for entities and loot context: killer, explosion, enchantments.
import type { Id } from "../../id";
import type { DamageSourceSpec, EntityPredicateSpec, EntityTarget } from "../types";
import { round6 } from "../../transform-math";
import { atLeast, conditionKey, idStr, since } from "../render/common";
import { renderDamageSource } from "../render/damage";
import { renderEntitySpec } from "../render/entity";
import type { Build } from "./world";

export const entity =
  (spec: EntityPredicateSpec, who: EntityTarget): Build =>
  (v) => ({
    ...conditionKey(v, "entity_properties"),
    entity: who,
    predicate: renderEntitySpec(spec, v),
  });

export const scores =
  (s: Record<string, number | { min?: number; max?: number }>, who: EntityTarget): Build =>
  (v) => ({
    ...conditionKey(v, "entity_scores"),
    entity: who,
    scores: Object.fromEntries(
      Object.entries(s).map(([obj, b]) => [
        obj,
        typeof b === "number" ? b : { min: b.min, max: b.max },
      ]),
    ),
  });

export const killedByPlayer =
  (inverse?: boolean): Build =>
  (v) => ({
    ...conditionKey(v, "killed_by_player"),
    ...(inverse === undefined ? {} : { inverse }),
  });

export const survivesExplosion = (): Build => (v) =>
  conditionKey(v, "survives_explosion");

export const tableBonus =
  (enchantment: string | Id, chances: number[]): Build =>
  (v) => ({
    ...conditionKey(v, "table_bonus"),
    enchantment: idStr(enchantment),
    chances,
  });

export const damageSource =
  (spec: DamageSourceSpec): Build =>
  (v) => ({
    ...conditionKey(v, "damage_source_properties"),
    predicate: renderDamageSource(spec, v),
  });

export const enchantmentActive =
  (active: boolean): Build =>
  (v) => {
    since(v, "1.21", "enchantmentActive");
    return { ...conditionKey(v, "enchantment_active_check"), active };
  };

export const randomChanceWithBonus =
  (enchantment: string | Id, chance: number, perLevel: number): Build =>
  (v) => {
    const id = idStr(enchantment);
    if (atLeast(v, "1.21")) {
      return {
        ...conditionKey(v, "random_chance_with_enchanted_bonus"),
        enchantment: id,
        unenchanted_chance: chance,
        enchanted_chance: {
          type: "minecraft:linear",
          base: round6(chance + perLevel),
          per_level_above_first: perLevel,
        },
      };
    }
    // Before 1.21 only looting could scale a chance.
    if (id !== "minecraft:looting") {
      throw new Error(
        `Predicate randomChanceWithBonus for ${id} needs 1.21+; earlier versions only support looting (the pack targets ${v.id})`,
      );
    }
    return {
      ...conditionKey(v, "random_chance_with_looting"),
      chance,
      looting_multiplier: perLevel,
    };
  };
