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

  it("writes its own id when nested as a passenger", () => {
    expect(Tnt({ fuse: 40 }).asPassenger().render(v1_21_4)).toBe(
      `{fuse:40s,id:"minecraft:tnt"}`,
    );
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

  it("renders an item member through the item_display schema", () => {
    const rig = Display.item(Item.NETHERITE_SWORD, {}, "head").add(Block.STONE).named("boss");
    expect(rig.toNbt().entity).toBe("minecraft:item_display");
    const out = rig.render(v26_2);
    expect(out).toContain(`item:{id:"minecraft:netherite_sword",count:1},item_display:"head"`);
    // The child keeps its own type - a group may mix block and item members.
    expect(out).toContain(`id:"minecraft:block_display"`);
  });

  it("rides an interaction hitbox on the root, sized from the model bounds", () => {
    const d = Display(Block.STONE)
      .add(Block.STONE, { translation: [0, 3, 2] })
      .named("boss")
      .hitbox();
    // bounds are 1 x 4 x 3 -> width = max(x,z) = 3, height = y = 4.
    expect(d.render(v26_2)).toContain(
      `{width:3.0f,height:4.0f,response:1b,Tags:["boss","boss_hitbox"],id:"minecraft:interaction"}`,
    );
    expect(d.hitboxSelector()).toBe("@e[tag=boss_hitbox]");
    // The hitbox is not an animatable member - only the two displays are.
    expect(d.members()).toHaveLength(2);
  });

  it("shifts every member by the group offset, leaving the hitbox anchored", () => {
    const d = Display(Block.STONE, { translation: [0, 0.5, 0] })
      .add(Block.STONE, { translation: [0, 2, 0] })
      .named("rig")
      .offset([0, -1.5, 0])
      .hitbox(1, 1);
    const out = d.render(v26_2);
    expect(out).toContain("translation:[0.0f,-1.0f,0.0f]"); // root: 0.5 - 1.5
    expect(out).toContain("translation:[0.0f,0.5f,0.0f]"); // child: 2 - 1.5
    expect(out).toContain("width:1.0f,height:1.0f");
  });

  it("carries interpolation defaults onto every display member", () => {
    const d = Display(Block.STONE).interpolation(4).teleportDuration(6);
    expect(d.render(v26_2)).toContain("interpolation_duration:4,teleport_duration:6");
  });
});
