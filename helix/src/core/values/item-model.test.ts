import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildResourcePack } from "../codegen/codegen";
import { v26_2 } from "../../versions/profiles";
import { ModelRef } from "./model";
import {
  ItemModel,
  TintSource,
  SpecialModel,
  CONDITION_PROPERTIES,
  RANGE_DISPATCH_PROPERTIES,
  SELECT_PROPERTIES,
} from "./item-model";

/** Build the resource pack and return the parsed JSON at `path` (fails if missing). */
function emitted(dp: Datapack, path: string): any {
  const files = buildResourcePack(dp);
  expect(files.has(path), `expected file ${path}`).toBe(true);
  return JSON.parse(files.get(path)!);
}

describe("ItemModel union", () => {
  it("model: flat, with optional tints", () => {
    expect(ItemModel.model("ns:item/sword").toJson()).toEqual({
      type: "minecraft:model",
      model: "ns:item/sword",
    });
    expect(ItemModel.model("ns:item/leather", [TintSource.dye(0xffffff)]).toJson()).toEqual({
      type: "minecraft:model",
      model: "ns:item/leather",
      tints: [{ type: "minecraft:dye", default: 0xffffff }],
    });
  });

  it("accepts a ModelRef as the model reference", () => {
    const ref = new ModelRef("ns:sword");
    expect(ItemModel.model(ref).toJson()).toEqual({
      type: "minecraft:model",
      model: "ns:sword",
    });
  });

  it("composite nests sub-models", () => {
    expect(
      ItemModel.composite([ItemModel.model("ns:a"), ItemModel.empty()]).toJson(),
    ).toEqual({
      type: "minecraft:composite",
      models: [
        { type: "minecraft:model", model: "ns:a" },
        { type: "minecraft:empty" },
      ],
    });
  });

  it("condition branches on a property with on_true/on_false and extra opts", () => {
    expect(
      ItemModel.condition(
        CONDITION_PROPERTIES.HAS_COMPONENT,
        ItemModel.model("ns:on"),
        ItemModel.model("ns:off"),
        { component: "minecraft:damage" },
      ).toJson(),
    ).toEqual({
      type: "minecraft:condition",
      property: "minecraft:has_component",
      component: "minecraft:damage",
      on_true: { type: "minecraft:model", model: "ns:on" },
      on_false: { type: "minecraft:model", model: "ns:off" },
    });
  });

  it("select renders cases + fallback", () => {
    expect(
      ItemModel.select(
        SELECT_PROPERTIES.DISPLAY_CONTEXT,
        [{ when: "gui", model: ItemModel.model("ns:flat") }, { when: ["firstperson_righthand"], model: ItemModel.model("ns:3d") }],
        ItemModel.model("ns:default"),
      ).toJson(),
    ).toEqual({
      type: "minecraft:select",
      property: "minecraft:display_context",
      cases: [
        { when: "gui", model: { type: "minecraft:model", model: "ns:flat" } },
        { when: ["firstperson_righthand"], model: { type: "minecraft:model", model: "ns:3d" } },
      ],
      fallback: { type: "minecraft:model", model: "ns:default" },
    });
  });

  it("range_dispatch renders scale, entries and fallback", () => {
    expect(
      ItemModel.rangeDispatch(
        RANGE_DISPATCH_PROPERTIES.DAMAGE,
        [
          { threshold: 0, model: ItemModel.model("ns:fresh") },
          { threshold: 0.5, model: ItemModel.model("ns:cracked") },
        ],
        { scale: 1, fallback: ItemModel.model("ns:broken") },
      ).toJson(),
    ).toEqual({
      type: "minecraft:range_dispatch",
      property: "minecraft:damage",
      scale: 1,
      entries: [
        { threshold: 0, model: { type: "minecraft:model", model: "ns:fresh" } },
        { threshold: 0.5, model: { type: "minecraft:model", model: "ns:cracked" } },
      ],
      fallback: { type: "minecraft:model", model: "ns:broken" },
    });
  });

  it("empty and bundle/selected_item are bare terminals", () => {
    expect(ItemModel.empty().toJson()).toEqual({ type: "minecraft:empty" });
    expect(ItemModel.bundleSelectedItem().toJson()).toEqual({
      type: "minecraft:bundle/selected_item",
    });
  });

  it("special wraps a SpecialModel with a base", () => {
    expect(ItemModel.special("ns:template/bed", SpecialModel.bed("ns:red")).toJson()).toEqual({
      type: "minecraft:special",
      base: "ns:template/bed",
      model: { type: "minecraft:bed", texture: "ns:red" },
    });
  });

  it("raw wins over the typed arms", () => {
    const json = { type: "custom:thing", foo: 1 };
    expect(ItemModel.raw(json).toJson()).toBe(json);
  });
});

describe("TintSource / SpecialModel", () => {
  it("tint sources carry their fields and normalize ids", () => {
    expect(TintSource.constant([1, 0, 0]).toJson()).toEqual({
      type: "minecraft:constant",
      value: [1, 0, 0],
    });
    expect(TintSource.grass(0.5, 0.4).toJson()).toEqual({
      type: "minecraft:grass",
      temperature: 0.5,
      downfall: 0.4,
    });
    expect(TintSource.customModelData(2, 0x00ff00).toJson()).toEqual({
      type: "minecraft:custom_model_data",
      index: 2,
      default: 0x00ff00,
    });
  });

  it("special models carry their fields; conduit/shield are bare", () => {
    expect(SpecialModel.chest("ns:chest", 0.5).toJson()).toEqual({
      type: "minecraft:chest",
      texture: "ns:chest",
      openness: 0.5,
    });
    expect(SpecialModel.conduit().toJson()).toEqual({ type: "minecraft:conduit" });
    expect(SpecialModel.standingSign("oak").toJson()).toEqual({
      type: "minecraft:standing_sign",
      wood_type: "oak",
    });
  });
});

describe("dp.itemDefinition codegen", () => {
  it("emits the full nested union at assets/<ns>/items/<name>.json", () => {
    const dp = new Datapack("testpack", v26_2);
    const ref = dp.itemDefinition(
      "sword",
      ItemModel.rangeDispatch(RANGE_DISPATCH_PROPERTIES.DAMAGE, [
        { threshold: 0, model: ItemModel.model("testpack:item/sword") },
        { threshold: 0.5, model: ItemModel.model("testpack:item/sword_cracked") },
      ]),
    );
    expect(ref).toBeInstanceOf(ModelRef);
    expect(ref.id).toBe("testpack:sword");
    expect(emitted(dp, "assets/testpack/items/sword.json")).toEqual({
      model: {
        type: "minecraft:range_dispatch",
        property: "minecraft:damage",
        entries: [
          { threshold: 0, model: { type: "minecraft:model", model: "testpack:item/sword" } },
          { threshold: 0.5, model: { type: "minecraft:model", model: "testpack:item/sword_cracked" } },
        ],
      },
    });
  });

  it("options lower to hand_animation_on_swap / oversized_in_gui", () => {
    const dp = new Datapack("testpack", v26_2);
    dp.itemDefinition("x", ItemModel.model("testpack:item/x"), {
      handAnimationOnSwap: false,
      oversizedInGui: true,
    });
    expect(emitted(dp, "assets/testpack/items/x.json")).toEqual({
      model: { type: "minecraft:model", model: "testpack:item/x" },
      hand_animation_on_swap: false,
      oversized_in_gui: true,
    });
  });

  it("re-registering the same name with different content throws", () => {
    const dp = new Datapack("testpack", v26_2);
    dp.itemDefinition("x", ItemModel.model("testpack:item/x"));
    expect(() =>
      dp.itemDefinition("x", ItemModel.model("testpack:item/other")),
    ).toThrow(/already registered/);
  });

  it("re-registering identical content is idempotent (dp.model twice)", () => {
    const dp = new Datapack("testpack", v26_2);
    dp.itemDefinition("x", ItemModel.model("testpack:item/x"));
    expect(() =>
      dp.itemDefinition("x", ItemModel.model("testpack:item/x")),
    ).not.toThrow();
  });
});
