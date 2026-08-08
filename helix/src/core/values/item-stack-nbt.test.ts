import { describe, it, expect } from "vitest";
import { Item } from "./item";
import { Nbt } from "./nbt";
import { EntityType } from "./resource.generated";
import { v26_1_2 } from "../../versions/profiles";
import { v1_20_1 } from "../../versions/profiles";

describe("ItemValue.toStackNbt", () => {
  it("renders the modern count/components stack compound", () => {
    const door = Item.SPRUCE_DOOR.named("???");
    expect(door.toStackNbt(v26_1_2)).toBe(
      '{id:"minecraft:spruce_door",count:1,components:{"minecraft:custom_name":{"text":"???"}}}',
    );
  });

  it("falls back to Count/tag before data components", () => {
    const door = Item.SPRUCE_DOOR.named("???");
    expect(door.toStackNbt(v1_20_1)).toBe(
      '{id:"minecraft:spruce_door",Count:1b,tag:{display:{Name:\'{"text":"???"}\'}}}',
    );
  });

  it("carries the item's own count", () => {
    expect(Item.STONE.count(16).toStackNbt(v26_1_2)).toBe('{id:"minecraft:stone",count:16}');
  });

  it("embeds in a surrounding Nbt compound", () => {
    const frame = Nbt({ Invulnerable: true, Item: Item.SPRUCE_DOOR.named("???").stackNbt() });
    expect(frame.render(v26_1_2)).toBe(
      '{Invulnerable:true,Item:{id:"minecraft:spruce_door",count:1,' +
        'components:{"minecraft:custom_name":{"text":"???"}}}}',
    );
  });

  it("refuses an item defined only by a raw data string", () => {
    expect(() => Item.STONE.data("[custom_name={}]").toStackNbt(v26_1_2)).toThrow(/raw \.data/);
  });
});

describe("embedded CommandValues in SNBT", () => {
  it("quotes an id, which SNBT would not accept bare", () => {
    expect(Nbt({ id: EntityType.ENDERMAN }).render(v26_1_2)).toBe('{id:"minecraft:enderman"}');
  });

  it("leaves a compound or list rendering alone", () => {
    expect(Nbt({ Item: Item.STONE.stackNbt() }).render(v26_1_2)).toBe(
      '{Item:{id:"minecraft:stone",count:1}}',
    );
  });
});
