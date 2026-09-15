import { describe, it, expect } from "vitest";
import { ModelRef } from "../model";
import {
  ItemModel,
  TintSource,
  SpecialModel,
  CONDITION_PROPERTIES,
  RANGE_DISPATCH_PROPERTIES,
  SELECT_PROPERTIES,
} from ".";

describe("ItemModel union", () => {
  it("model: flat, with optional tints", () => {
    expect(ItemModel.model("ns:item/sword").toJson()).toEqual({
      type: "minecraft:model",
      model: "ns:item/sword",
    });
    expect(
      ItemModel.model("ns:item/leather", [TintSource.dye(0xffffff)]).toJson(),
    ).toEqual({
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
      ItemModel.composite([
        ItemModel.model("ns:a"),
        ItemModel.empty(),
      ]).toJson(),
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
        [
          { when: "gui", model: ItemModel.model("ns:flat") },
          { when: ["firstperson_righthand"], model: ItemModel.model("ns:3d") },
        ],
        ItemModel.model("ns:default"),
      ).toJson(),
    ).toEqual({
      type: "minecraft:select",
      property: "minecraft:display_context",
      cases: [
        { when: "gui", model: { type: "minecraft:model", model: "ns:flat" } },
        {
          when: ["firstperson_righthand"],
          model: { type: "minecraft:model", model: "ns:3d" },
        },
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
        {
          threshold: 0.5,
          model: { type: "minecraft:model", model: "ns:cracked" },
        },
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
    expect(
      ItemModel.special("ns:template/bed", SpecialModel.bed("ns:red")).toJson(),
    ).toEqual({
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
