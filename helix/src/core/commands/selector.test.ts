import { describe, it, expect } from "vitest";
import { Selector } from "../frontend/nodes/selector";
import { renderSelector, renderExistence } from "./selector";
import { Range } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { Nbt } from "../values/nbt";
import { v1_21_4 } from "../../versions/profiles";
import { EntityType } from "../values/resource.generated";
import { Gamemode, Sort } from "../values/enums";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";

describe("Selector rendering", () => {
  it("renders a volume box as x/y/z/dx/dy/dz", () => {
    const sel = Selector.allPlayers().volume([4, 66, 4], [0, 64, 0]);
    expect(renderSelector(sel.build())).toBe("@a[x=0,y=64,z=0,dx=4,dy=2,dz=4]");
  });

  it("renders an nbt arm version-aware", () => {
    const sel = Selector.allPlayers()
      .volume([0, 64, 0], [4, 66, 4])
      .nbt(Nbt({ SelectedItem: { id: "minecraft:lantern" } }));
    expect(sel.render(v1_21_4)).toBe(
      '@a[x=0,y=64,z=0,dx=4,dy=2,dz=4,nbt={SelectedItem:{id:"minecraft:lantern"}}]',
    );
  });

  it("renders a typed entity type filter", () => {
    expect(Selector.allEntities().type(EntityType.ENDERMAN).toString()).toBe(
      "@e[type=minecraft:enderman]",
    );
  });

  it("passes a #tag entity type through as a registry tag reference", () => {
    expect(Selector.allEntities().type(EntityType("#tunnel:removable")).toString()).toBe(
      "@e[type=#tunnel:removable]",
    );
  });

  it("matches several types through a declared entity type tag", () => {
    const dp = new Datapack("p", v1_21_4);
    const shot = dp.entityTypeTag("shot", [EntityType.TNT, EntityType.ZOMBIE]);
    dp.entityTypeTag("shot", [EntityType.TNT, EntityType.ARMOR_STAND]);
    expect(Selector.allEntities().type(shot).toString()).toBe("@e[type=#p:shot]");
    expect(JSON.parse(buildDatapack(dp).get("data/p/tags/entity_type/shot.json")!).values).toEqual([
      "minecraft:tnt",
      "minecraft:zombie",
      "minecraft:armor_stand",
    ]);
  });

  it("renders a partial vertical band (y/dy, no x/z)", () => {
    expect(Selector.self().yBand(-30, -100).toString()).toBe("@s[y=-30,dy=-100]");
    expect(Selector.allPlayers().span(0, 16, 0).toString()).toBe("@a[dx=0,dy=16,dz=0]");
  });

  it("ANDs negated game modes onto a selector", () => {
    expect(
      Selector.allPlayers().notGamemode(Gamemode.CREATIVE).notGamemode(Gamemode.SPECTATOR).toString(),
    ).toBe("@a[gamemode=!creative,gamemode=!spectator]");
  });

  it("throws if an nbt selector is rendered without a version (toString)", () => {
    const sel = Selector.allPlayers().nbt(Nbt({ SelectedItem: { id: "minecraft:lantern" } }));
    expect(() => sel.toString()).toThrow(/requires a version/);
  });
});

describe("renderExistence", () => {
  it("adds limit=1 only to selectors that can match many", () => {
    expect(renderExistence(Selector.allEntities().tag("t"))).toBe("@e[tag=t,limit=1]");
    expect(renderExistence(Selector.nearest())).toBe("@p");
    expect(renderExistence(Selector.self())).toBe("@s");
    expect(renderExistence("@e[tag=raw]")).toBe("@e[tag=raw]");
  });

  it("keeps an explicit limit, even 0", () => {
    expect(renderExistence(Selector.allPlayers().limit(5))).toBe("@a[limit=5]");
    expect(renderExistence(Selector.allPlayers().limit(0))).toBe("@a[limit=0]");
  });
});

describe("SelectorNode queries", () => {
  it("picksOne follows limit over base", () => {
    expect(Selector.allEntities().limit(1).build().picksOne()).toBe(true);
    expect(Selector.nearest().limit(3).build().picksOne()).toBe(false);
    expect(Selector.random().build().picksOne()).toBe(true);
  });

  it("isBareSelf is false once any filter is added", () => {
    expect(Selector.self().build().isBareSelf()).toBe(true);
    expect(Selector.self().notGamemode(Gamemode.CREATIVE).build().isBareSelf()).toBe(false);
    expect(Selector.self().yBand(0, 1).build().isBareSelf()).toBe(false);
  });

  it("scans only for @-bases other than @s", () => {
    expect(Selector.allPlayers().build().scans()).toBe(true);
    expect(Selector.self().build().scans()).toBe(false);
    expect(Selector.uuid("Steve").build().scans()).toBe(false);
  });

  it("readsState for scores, nbt and predicates but not tags", () => {
    expect(Selector.allEntities().tag("t").build().readsState()).toBe(false);
    expect(Selector.allEntities().score(new Objective("o"), Range.atLeast(1)).build().readsState()).toBe(true);
    expect(Selector.allEntities().predicate("p:x").build().readsState()).toBe(true);
  });

  it("picksRandomly for @r or sort=random", () => {
    expect(Selector.random().build().picksRandomly()).toBe(true);
    expect(Selector.allEntities().sort(Sort.RANDOM).build().picksRandomly()).toBe(true);
    expect(Selector.allEntities().sort(Sort.NEAREST).build().picksRandomly()).toBe(false);
  });
});
