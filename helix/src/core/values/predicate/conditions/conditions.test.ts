import { describe, it, expect } from "vitest";
import { v1_20_1, v1_21_4, v26_1_2, v26_3_rc_2 } from "../../../../versions/profiles";
import { Enchantment, EntityType } from "../../resource.generated";
import { Predicate } from "..";

describe("loot and world conditions", () => {
  it("renders killed_by_player, survives_explosion and table_bonus", () => {
    expect(Predicate.killedByPlayer().toJson(v1_21_4)).toEqual({
      condition: "minecraft:killed_by_player",
    });
    expect(Predicate.survivesExplosion().toJson(v26_3_rc_2)).toEqual({
      type: "minecraft:survives_explosion",
    });
    expect(Predicate.tableBonus(Enchantment.FORTUNE, [0.1, 0.2]).toJson(v1_21_4)).toEqual({
      condition: "minecraft:table_bonus",
      enchantment: "minecraft:fortune",
      chances: [0.1, 0.2],
    });
  });

  it("renders a damage source with tags and entities", () => {
    const p = Predicate.damageSource({
      tags: [{ id: "#minecraft:is_fire", expected: true }],
      sourceEntity: { type: EntityType.BLAZE },
      isDirect: false,
    });
    expect(p.toJson(v1_21_4)).toEqual({
      condition: "minecraft:damage_source_properties",
      predicate: {
        tags: [{ id: "minecraft:is_fire", expected: true }],
        source_entity: { type: "minecraft:blaze" },
        is_direct: false,
      },
    });
    expect(() => p.toJson(v1_20_1)).toThrow("isDirect needs 1.21+");
    expect((p.toJson(v26_3_rc_2) as any).predicate.tags[0].id).toBe("#minecraft:is_fire");
  });

  it("falls back to random_chance_with_looting before 1.21, for looting only", () => {
    const looting = Predicate.randomChanceWithBonus(Enchantment.LOOTING, 0.1, 0.05);
    expect(looting.toJson(v1_20_1)).toEqual({
      condition: "minecraft:random_chance_with_looting",
      chance: 0.1,
      looting_multiplier: 0.05,
    });
    expect(looting.toJson(v1_21_4)).toMatchObject({
      condition: "minecraft:random_chance_with_enchanted_bonus",
      unenchanted_chance: 0.1,
      enchanted_chance: { type: "minecraft:linear", base: 0.15, per_level_above_first: 0.05 },
    });
    expect(() =>
      Predicate.randomChanceWithBonus(Enchantment.FORTUNE, 0.1, 0.05).toJson(v1_20_1),
    ).toThrow("only support looting");
  });

  it("requires a clock on time_check from 26.1", () => {
    const day = { value: { min: 0, max: 12000 }, period: 24000 };
    expect(Predicate.timeCheck(day).toJson(v1_21_4)).toEqual({
      condition: "minecraft:time_check",
      value: { min: 0, max: 12000 },
      period: 24000,
    });
    expect(() => Predicate.timeCheck(day).toJson(v26_1_2)).toThrow("needs a clock");
    expect(
      Predicate.timeCheck({ ...day, clock: "minecraft:overworld" }).toJson(v26_1_2),
    ).toMatchObject({ clock: "minecraft:overworld" });
  });

  it("adds location offsets and gates the 1.21+/26.1+ conditions", () => {
    expect(Predicate.location({ smokey: true }, [0, -1, 0]).toJson(v1_21_4)).toEqual({
      condition: "minecraft:location_check",
      offsetX: 0,
      offsetY: -1,
      offsetZ: 0,
      predicate: { smokey: true },
    });
    expect(() => Predicate.enchantmentActive(true).toJson(v1_20_1)).toThrow("1.21+");
    expect(() => Predicate.environmentAttribute("minecraft:gameplay/can_start_raid", true).toJson(v1_21_4)).toThrow("26.1+");
  });
});
