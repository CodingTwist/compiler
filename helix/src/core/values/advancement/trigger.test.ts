import { describe, it, expect } from "vitest";
import { Trigger } from ".";
import { Item } from "../item";
import { Block } from "../block";
import { Dimension } from "../resource.generated";
import { Predicate } from "../predicate";
import { v1_21_4, v26_3_rc_2 } from "../../../versions/profiles";

describe("Trigger", () => {
  it("renders using_item with the item's predicate form", () => {
    const wand = Item("stick").named("Frost Wand").modelData(7);
    expect(Trigger.usingItem(wand).toJson(v1_21_4)).toEqual({
      trigger: "minecraft:using_item",
      conditions: { item: wand.toPredicate(v1_21_4) },
    });
  });

  it("renders player_hurt_entity gated by holding the item (reuses Predicate.holding)", () => {
    const wand = Item("stick").named("Frost Wand");
    const json = Trigger.playerHurtEntity(wand).toJson(v1_21_4);
    expect(json.trigger).toBe("minecraft:player_hurt_entity");
    const player = (json.conditions as Record<string, unknown>)
      .player as Record<string, unknown>[];
    expect(player[0].condition).toBe("minecraft:entity_properties");
    expect((player[0].predicate as Record<string, unknown>).equipment).toEqual({
      mainhand: wand.toPredicate(v1_21_4),
    });
  });

  it("renders player_hurt_entity gated by the attacked entity", () => {
    expect(Trigger.playerHurtEntityMatching({ type: "minecraft:interaction" }).toJson(v26_3_rc_2)).toEqual({
      trigger: "minecraft:player_hurt_entity",
      conditions: {
        entity: {
          type: "minecraft:entity_properties",
          entity: "this",
          predicate: { entity_type: "minecraft:interaction" },
        },
      },
    });
  });
});

describe("Trigger location/entity/block helpers", () => {
  it("location renders through the same shape as an entity_properties location check", () => {
    const t = Trigger.location({
      dimension: "minecraft:the_end",
      position: { x: { min: 1, max: 2 } },
    });
    expect(t.toJson(v1_21_4)).toEqual({
      trigger: "minecraft:location",
      conditions: {
        player: {
          location: {
            dimension: "minecraft:the_end",
            position: { x: { min: 1, max: 2 } },
          },
        },
      },
    });
  });

  it("enterBlock renders the block id", () => {
    expect(Trigger.enterBlock("minecraft:end_gateway").toJson(v1_21_4)).toEqual(
      {
        trigger: "minecraft:enter_block",
        conditions: { block: "minecraft:end_gateway" },
      },
    );
  });

  it("placedBlock takes a Block, and a typed Dimension in its location", () => {
    const json = Trigger.placedBlock(Block.STONE_BUTTON, {
      dimension: Dimension.THE_END,
    }).toJson(v1_21_4);
    expect(json.conditions?.block).toBe("minecraft:stone_button");
    expect(JSON.stringify(json.conditions?.location)).toContain(
      '"dimension":"minecraft:the_end"',
    );
  });

  it("consumeItem renders the item's predicate form", () => {
    const fruit = Item("chorus_fruit");
    expect(Trigger.consumeItem(fruit).toJson(v1_21_4)).toEqual({
      trigger: "minecraft:consume_item",
      conditions: { item: fruit.toPredicate(v1_21_4) },
    });
  });

  it("playerKilledEntity renders the entity spec, or omits conditions entirely", () => {
    expect(
      Trigger.playerKilledEntity({ type: "minecraft:ender_dragon" }).toJson(
        v1_21_4,
      ),
    ).toEqual({
      trigger: "minecraft:player_killed_entity",
      conditions: { entity: { type: "minecraft:ender_dragon" } },
    });
    expect(Trigger.playerKilledEntity().toJson(v1_21_4)).toEqual({
      trigger: "minecraft:player_killed_entity",
    });
  });

  it("placedBlock renders block plus an optional location_check list", () => {
    expect(
      Trigger.placedBlock("minecraft:stone_button", {
        dimension: "minecraft:the_end",
      }).toJson(v1_21_4),
    ).toEqual({
      trigger: "minecraft:placed_block",
      conditions: {
        block: "minecraft:stone_button",
        location: [
          Predicate.location({ dimension: "minecraft:the_end" }).toJson(
            v1_21_4,
          ),
        ],
      },
    });
  });

  it("inventoryChanged and impossible take no conditions", () => {
    expect(Trigger.inventoryChanged().toJson(v1_21_4)).toEqual({
      trigger: "minecraft:inventory_changed",
    });
    expect(Trigger.impossible().toJson(v1_21_4)).toEqual({
      trigger: "minecraft:impossible",
    });
  });
});

describe("Trigger on 26.3", () => {
  it("location takes one entity_properties condition keyed by type", () => {
    expect(Trigger.location({ position: { x: 1 } }).toJson(v26_3_rc_2)).toEqual({
      trigger: "minecraft:location",
      conditions: {
        player: {
          type: "minecraft:entity_properties",
          entity: "this",
          predicate: { location: { position: { x: 1 } } },
        },
      },
    });
  });
});
