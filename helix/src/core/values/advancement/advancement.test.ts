import { describe, it, expect } from "vitest";
import { AdvancementDef, Trigger } from "./advancement";
import { Item } from "./item";
import { Predicate } from "./predicate";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

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
    const player = (json.conditions as Record<string, unknown>).player as Record<string, unknown>[];
    expect(player[0].condition).toBe("minecraft:entity_properties");
    expect((player[0].predicate as Record<string, unknown>).equipment).toEqual({
      mainhand: wand.toPredicate(v1_21_4),
    });
  });
});

describe("AdvancementDef", () => {
  it("renders criteria + reward function", () => {
    const wand = Item("stick").named("Frost Wand");
    const def = new AdvancementDef()
      .criterion("trigger", Trigger.usingItem(wand))
      .reward("mypack:zzz/item/stick/on_use");
    expect(def.toJson(v1_21_4)).toEqual({
      criteria: { trigger: Trigger.usingItem(wand).toJson(v1_21_4) },
      rewards: { function: "mypack:zzz/item/stick/on_use" },
    });
  });

  it("omits rewards when none is set", () => {
    const def = new AdvancementDef().criterion("t", Trigger.of("minecraft:tick"));
    expect(def.toJson(v1_21_4)).toEqual({
      criteria: { t: { trigger: "minecraft:tick" } },
    });
  });

  it("renders parent and a full display block", () => {
    const icon = Item("stone_bricks");
    const def = new AdvancementDef()
      .criterion("t", Trigger.impossible())
      .parent("mypack:core/root")
      .display({
        title: { text: "Title", color: "white" },
        description: { text: "Desc", color: "dark_gray" },
        icon,
        frame: "challenge",
        hidden: true,
      });
    expect(def.toJson(v1_21_4)).toEqual({
      criteria: { t: { trigger: "minecraft:impossible" } },
      parent: "mypack:core/root",
      display: {
        icon: { id: "minecraft:stone_bricks" },
        title: { text: "Title", color: "white" },
        description: { text: "Desc", color: "dark_gray" },
        frame: "challenge",
        show_toast: true,
        announce_to_chat: true,
        hidden: true,
      },
    });
  });
});

describe("Trigger location/entity/block helpers", () => {
  it("location renders through the same shape as an entity_properties location check", () => {
    const t = Trigger.location({ dimension: "minecraft:the_end", position: { x: { min: 1, max: 2 } } });
    expect(t.toJson(v1_21_4)).toEqual({
      trigger: "minecraft:location",
      conditions: {
        player: { location: { dimension: "minecraft:the_end", position: { x: { min: 1, max: 2 } } } },
      },
    });
  });

  it("enterBlock renders the block id", () => {
    expect(Trigger.enterBlock("minecraft:end_gateway").toJson(v1_21_4)).toEqual({
      trigger: "minecraft:enter_block",
      conditions: { block: "minecraft:end_gateway" },
    });
  });

  it("consumeItem renders the item's predicate form", () => {
    const fruit = Item("chorus_fruit");
    expect(Trigger.consumeItem(fruit).toJson(v1_21_4)).toEqual({
      trigger: "minecraft:consume_item",
      conditions: { item: fruit.toPredicate(v1_21_4) },
    });
  });

  it("playerKilledEntity renders the entity spec, or omits conditions entirely", () => {
    expect(Trigger.playerKilledEntity({ type: "minecraft:ender_dragon" }).toJson(v1_21_4)).toEqual({
      trigger: "minecraft:player_killed_entity",
      conditions: { entity: { type: "minecraft:ender_dragon" } },
    });
    expect(Trigger.playerKilledEntity().toJson(v1_21_4)).toEqual({
      trigger: "minecraft:player_killed_entity",
    });
  });

  it("placedBlock renders block plus an optional location_check list", () => {
    expect(Trigger.placedBlock("minecraft:stone_button", { dimension: "minecraft:the_end" }).toJson(v1_21_4)).toEqual({
      trigger: "minecraft:placed_block",
      conditions: {
        block: "minecraft:stone_button",
        location: [Predicate.location({ dimension: "minecraft:the_end" }).toJson(v1_21_4)],
      },
    });
  });

  it("inventoryChanged and impossible take no conditions", () => {
    expect(Trigger.inventoryChanged().toJson(v1_21_4)).toEqual({ trigger: "minecraft:inventory_changed" });
    expect(Trigger.impossible().toJson(v1_21_4)).toEqual({ trigger: "minecraft:impossible" });
  });
});

describe("Datapack.advancement registration", () => {
  it("emits JSON under the 1.21 singular folder and returns a referenceable id", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const ref = dp.advancement(
      "zzz/item/stick/on_use",
      new AdvancementDef().criterion("trigger", Trigger.usingItem(Item("stick"))),
    );
    expect(ref.render()).toBe("mypack:zzz/item/stick/on_use");

    const files = buildDatapack(dp);
    const path = "data/mypack/advancement/zzz/item/stick/on_use.json";
    expect(files.has(path)).toBe(true);
    expect(JSON.parse(files.get(path)!).criteria.trigger.trigger).toBe("minecraft:using_item");
  });

  it("uses the plural `advancements` folder on pre-1.21 versions", () => {
    const dp = new Datapack("mypack", v1_20_1);
    dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:tick")));
    const files = buildDatapack(dp);
    expect(files.has("data/mypack/advancements/foo.json")).toBe(true);
  });

  it("event emits the advancement, the reward function, and the re-arming revoke", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const { advancement, fn } = dp.event("exit/eat_chorus", Trigger.consumeItem(Item("chorus_fruit")), (ctx) => {
      ctx.say("out you go");
    });
    expect(advancement.render()).toBe("mypack:exit/eat_chorus");
    expect(dp.idOf(fn).render()).toBe("mypack:exit/eat_chorus");

    const files = buildDatapack(dp);
    const json = JSON.parse(files.get("data/mypack/advancement/exit/eat_chorus.json")!);
    expect(json.criteria.trigger.trigger).toBe("minecraft:consume_item");
    expect(json.rewards).toEqual({ function: "mypack:exit/eat_chorus" });

    const lines = files.get("data/mypack/function/exit/eat_chorus.mcfunction")!.trim().split("\n");
    expect(lines.at(-1)).toBe("advancement revoke @s only mypack:exit/eat_chorus");
  });

  it("rejects re-registering a name with a different definition", () => {
    const dp = new Datapack("mypack", v1_21_4);
    dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:tick")));
    expect(() =>
      dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:impossible"))),
    ).toThrow();
  });
});
