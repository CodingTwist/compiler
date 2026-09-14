import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { buildResourcePack } from "../../codegen/resource-pack";
import { v26_2 } from "../../../versions/profiles";
import { ModelRef } from "../model";
import { ItemModel, RANGE_DISPATCH_PROPERTIES } from ".";

/** Build the resource pack and return the parsed JSON at `path` (fails if missing). */
function emitted(dp: Datapack, path: string): any {
  const files = buildResourcePack(dp);
  expect(files.has(path), `expected file ${path}`).toBe(true);
  return JSON.parse(files.get(path)!);
}

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
