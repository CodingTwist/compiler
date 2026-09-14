import { describe, it, expect } from "vitest";
import { Item } from "./item";
import { v26_1_2 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

describe("ItemValue.canPlaceOn", () => {
  it("lowers a single #tag to the structured can_place_on component", () => {
    const button = Item.STONE_BUTTON.canPlaceOn("#minecraft:stone_bricks");
    expect(button.render(v26_1_2)).toBe(
      'minecraft:stone_button[can_place_on={blocks:"#minecraft:stone_bricks"}]',
    );
  });

  it("lists several blocks under a single predicate", () => {
    const button = Item.STONE_BUTTON.canPlaceOn("minecraft:stone", "#minecraft:planks");
    expect(button.render(v26_1_2)).toBe(
      'minecraft:stone_button[can_place_on=' +
        '{blocks:["minecraft:stone","#minecraft:planks"]}]',
    );
  });

  it("matches its own item predicate by construction", () => {
    const button = Item.STONE_BUTTON.canPlaceOn("#minecraft:stone_bricks");
    expect(button.toPredicate(v26_1_2)).toEqual({
      items: "minecraft:stone_button",
      components: {
        "minecraft:can_place_on": { blocks: "#minecraft:stone_bricks" },
      },
    });
  });

  it("falls back to the flat CanPlaceOn NBT list before data components", () => {
    const button = Item.STONE_BUTTON.canPlaceOn("#minecraft:stone_bricks");
    expect(button.render(v1_20_1)).toBe(
      'minecraft:stone_button{CanPlaceOn:["#minecraft:stone_bricks"]}',
    );
  });
});
