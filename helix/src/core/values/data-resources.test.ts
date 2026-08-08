import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_4 } from "../../versions/profiles";
import { Item } from "./item";
import { LootTableDef, LootPool, LootTableRef } from "./loot-table";
import { LootFunction } from "./loot-function";
import { ItemModifier, ItemModifierRef } from "./item-modifier";
import { RecipeDef, RecipeRef } from "./recipe";

/** Build `dp` and return the parsed JSON at `path` (fails if missing). */
function emitted(dp: Datapack, path: string): any {
  const files = buildDatapack(dp);
  expect(files.has(path), `expected file ${path}`).toBe(true);
  return JSON.parse(files.get(path)!);
}

describe("loot tables", () => {
  it("emits to the singular folder on 1.21+ with auto set_count from the item", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const ref = dp.lootTable(
      "chests/reward",
      new LootTableDef("chest").pool(new LootPool().rolls(1).item(Item.DIAMOND.count(3))),
    );
    expect(ref).toBeInstanceOf(LootTableRef);
    expect(ref.id).toBe("testpack:chests/reward");

    const json = emitted(dp, "data/testpack/loot_table/chests/reward.json");
    expect(json.type).toBe("minecraft:chest");
    const entry = json.pools[0].entries[0];
    expect(entry).toMatchObject({ type: "minecraft:item", name: "minecraft:diamond" });
    expect(entry.functions[0]).toMatchObject({
      function: "minecraft:set_count",
      count: 3,
    });
  });

  it("uses the plural folder on pre-1.21", () => {
    const dp = new Datapack("testpack", v1_20_4);
    dp.lootTable("x", new LootTableDef().pool(new LootPool().item(Item.STICK)));
    const files = buildDatapack(dp);
    expect(files.has("data/testpack/loot_tables/x.json")).toBe(true);
    expect(files.has("data/testpack/loot_table/x.json")).toBe(false);
  });

  it("set_components reuses the item's own components (single source)", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.lootTable(
      "named",
      new LootTableDef().pool(new LootPool().item(Item.DIAMOND_SWORD.named("Excalibur"))),
    );
    const json = emitted(dp, "data/testpack/loot_table/named.json");
    const fn = json.pools[0].entries[0].functions.find(
      (f: any) => f.function === "minecraft:set_components",
    );
    expect(fn.components["minecraft:custom_name"]).toBeTruthy();
  });

  it("throws when a name is reused with a different definition", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.lootTable("dup", new LootTableDef());
    expect(() => dp.lootTable("dup", new LootTableDef())).toThrow(/already registered/);
  });
});

describe("item modifiers", () => {
  it("emits a single function bare, and reuses loot-function vocabulary", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const ref = dp.itemModifier("sharpen", new ItemModifier().apply(LootFunction.setCount(2)));
    expect(ref).toBeInstanceOf(ItemModifierRef);
    const json = emitted(dp, "data/testpack/item_modifier/sharpen.json");
    expect(json).toMatchObject({ function: "minecraft:set_count", count: 2 });
  });

  it("emits multiple functions as an array", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.itemModifier(
      "chain",
      new ItemModifier().apply(LootFunction.setCount(2)).apply(LootFunction.furnaceSmelt()),
    );
    const json = emitted(dp, "data/testpack/item_modifier/chain.json");
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
  });
});

describe("recipes", () => {
  it("shaped recipe uses the `id` result key on 1.21+", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const ref = dp.recipe(
      "ruby_block",
      RecipeDef.shaped(["##", "##"], { "#": "mypack:ruby" }, "mypack:ruby_block"),
    );
    expect(ref).toBeInstanceOf(RecipeRef);
    const json = emitted(dp, "data/testpack/recipe/ruby_block.json");
    expect(json.type).toBe("minecraft:crafting_shaped");
    expect(json.key["#"]).toBe("mypack:ruby");
    expect(json.result).toMatchObject({ id: "mypack:ruby_block", count: 1 });
  });

  it("uses the legacy `{item}` ingredient/result shape + plural folder on pre-1.21", () => {
    const dp = new Datapack("testpack", v1_20_4);
    dp.recipe("sticks", RecipeDef.shapeless(["minecraft:oak_planks"], "minecraft:stick", 4));
    const json = emitted(dp, "data/testpack/recipes/sticks.json");
    expect(json.ingredients[0]).toEqual({ item: "minecraft:oak_planks" });
    expect(json.result).toMatchObject({ item: "minecraft:stick", count: 4 });
  });
});

describe("registry tags and raw registry files", () => {
  it("emits a registry tag, pluralizing the registry folder pre-1.21", () => {
    const modern = new Datapack("testpack", v1_21_4);
    modern.tag("block", "minable/pickaxe", { values: ["minecraft:stone"] });
    expect(emitted(modern, "data/testpack/tags/block/minable/pickaxe.json")).toEqual({
      replace: false,
      values: ["minecraft:stone"],
    });

    const legacy = new Datapack("testpack", v1_20_4);
    legacy.tag("block", "x", { values: ["minecraft:stone"] });
    const files = buildDatapack(legacy);
    expect(files.has("data/testpack/tags/blocks/x.json")).toBe(true);
  });

  it("appends values when the same tag is declared twice", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.tag("item", "gems", { values: ["minecraft:diamond"] });
    dp.tag("item", "gems", { values: ["minecraft:emerald"] });
    expect(emitted(dp, "data/testpack/tags/item/gems.json").values).toEqual([
      "minecraft:diamond",
      "minecraft:emerald",
    ]);
  });

  it("writes a raw registry file verbatim at its folder", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.registryFile("damage_type", "spikes", { message_id: "spikes", exhaustion: 0.1 });
    expect(emitted(dp, "data/testpack/damage_type/spikes.json")).toEqual({
      message_id: "spikes",
      exhaustion: 0.1,
    });
  });
});
