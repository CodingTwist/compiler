import { describe, it, expect } from "vitest";
import { Block } from "./block";
import { Item } from "./item";
import { Blaze, Tnt, Villager, Zombie } from "./entities.generated";
import { Display } from "./display";
import { v1_20_1, v1_21_4, v26_2 } from "../../versions/profiles";

describe("entity NBT schemas", () => {
  it("writes a renamed key in the target version's spelling", () => {
    const tnt = Tnt({ fuse: 40, tags: ["shell"] });
    expect(tnt.render(v1_21_4)).toBe(`{fuse:40s,Tags:["shell"]}`);
    // 1.20.3 snake_cased it; 1.20.1 predates that.
    expect(tnt.render(v1_20_1)).toBe(`{Fuse:40s,Tags:["shell"]}`);
  });

  it("drops a field the target version does not have", () => {
    const tnt = Tnt({ blockState: Block.SAND });
    expect(tnt.render(v1_21_4)).toBe(`{block_state:{Name:"minecraft:sand"}}`);
    expect(tnt.render(v1_20_1)).toBe("{}");
  });

  it("follows a field that changed type as well as name", () => {
    expect(Tnt({ fallDistance: 3 }).render(v1_21_4)).toBe("{FallDistance:3.0f}");
    expect(Tnt({ fallDistance: 3 }).render(v26_2)).toBe("{fall_distance:3.0d}");
  });

  it("keeps a nested compound typed one level down", () => {
    expect(Villager({ villagerData: { level: 2, profession: "farmer" } }).render(v1_21_4)).toBe(
      `{VillagerData:{level:2,profession:"farmer"}}`,
    );
  });

  it("covers every entity, not just the interesting ones", () => {
    // A mob with no NBT of its own still gets a factory, carrying the mob base.
    expect(Blaze({ persistenceRequired: true }).render(v1_21_4)).toBe("{PersistenceRequired:1b}");
    // …and one with its own fields carries those too.
    expect(Zombie({ isBaby: true, canBreakDoors: true }).render(v1_21_4)).toBe(
      "{IsBaby:1b,CanBreakDoors:1b}",
    );
  });

  it("takes an Item straight into an equipment slot", () => {
    expect(Zombie({ equipment: { mainhand: Item.CROSSBOW } }).render(v26_2)).toBe(
      `{equipment:{mainhand:{id:"minecraft:crossbow",count:1}}}`,
    );
  });

  it("renders a Display through the block_display schema, children as passengers", () => {
    const d = Display(Block.STONE).add(Block.OAK_PLANKS, { translation: [0, 1, 0] }).named("cog");
    expect(d.toNbt().entity).toBe("minecraft:block_display");
    expect(d.render(v26_2)).toContain(`Tags:["cog","cog_0"],Passengers:[{block_state:`);
  });

  it("merges raw keys last, for anything uncurated", () => {
    expect(Tnt({ fuse: 40 }, { Foo: 1 }).render(v1_21_4)).toBe("{fuse:40s,Foo:1}");
  });
});
