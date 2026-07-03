import { describe, it, expect } from "vitest";
import { AdvancementDef, Trigger } from "./advancement";
import { Item } from "./item";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_21_4 } from "../../versions/1_21_4";
import { v1_20_1 } from "../../versions/1_20_1";

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

  it("rejects re-registering a name with a different definition", () => {
    const dp = new Datapack("mypack", v1_21_4);
    dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:tick")));
    expect(() =>
      dp.advancement("foo", new AdvancementDef().criterion("t", Trigger.of("minecraft:impossible"))),
    ).toThrow();
  });
});
