import { describe, it, expect } from "vitest";
import { Predicate, SLOTS } from ".";
import { Item } from "../item";
import { Datapack } from "../../ir/datapack";
import { v26_1_2 } from "../../../versions/profiles";
import { buildDatapack } from "../../codegen/codegen";

describe("inventory slot matches", () => {
  it("Predicate.carrying matches an item anywhere in the inventory", () => {
    const dp = new Datapack("p", v26_1_2);
    const ref = dp.predicate(
      "has_disc",
      Predicate.carrying(Item.MUSIC_DISC_11),
    );
    const json = JSON.parse(
      buildDatapack(dp).get("data/p/predicate/has_disc.json")!,
    );
    expect(ref.id).toBe("p:has_disc");
    expect(json).toEqual({
      condition: "minecraft:entity_properties",
      entity: "this",
      predicate: {
        slots: {
          "container.*": { items: "minecraft:music_disc_11" },
        },
      },
    });
  });

  it("carries the item's components into the slot match", () => {
    const dp = new Datapack("p", v26_1_2);
    dp.predicate(
      "has_door",
      Predicate.carrying(Item.SPRUCE_DOOR.named("Anachronistic Door")),
    );
    const json = JSON.parse(
      buildDatapack(dp).get("data/p/predicate/has_door.json")!,
    );
    const slot = json.predicate.slots["container.*"];
    expect(slot.items).toBe("minecraft:spruce_door");
    expect(slot.components).toBeDefined();
  });

  it("a named slot range narrows the match", () => {
    const dp = new Datapack("p", v26_1_2);
    dp.predicate(
      "head",
      Predicate.entity({ slots: { [SLOTS.HEAD]: Item.PLAYER_HEAD } }),
    );
    const json = JSON.parse(
      buildDatapack(dp).get("data/p/predicate/head.json")!,
    );
    expect(Object.keys(json.predicate.slots)).toEqual(["armor.head"]);
  });
});

describe("item sub-predicates", () => {
  it("asks about a component instead of matching its value, and inverts", () => {
    const enchanted = Item("diamond_sword").subPredicate("enchantments", [{}]);

    expect(Predicate.matchTool(enchanted).toJson(v26_1_2)).toEqual({
      condition: "minecraft:match_tool",
      predicate: {
        items: "minecraft:diamond_sword",
        predicates: { "minecraft:enchantments": [{}] },
      },
    });

    // No negative form in vanilla item predicates - negate the condition.
    expect(Predicate.matchTool(enchanted).not().toJson(v26_1_2)).toMatchObject({
      condition: "minecraft:inverted",
    });

    // Predicate-only: never leaks into the give/stack form.
    expect(enchanted.render(v26_1_2)).toBe("minecraft:diamond_sword");
  });
});
