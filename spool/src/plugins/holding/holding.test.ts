import { describe, it, expect } from "vitest";
import { Selector, Item, Datapack, buildDatapack, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { holding } from "./index";

installKit([holding]);

describe("Selector.holding (kit)", () => {
  it("compiles to an engine-evaluated predicate arm, not an inline nbt scan", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const sel = Selector.allPlayers().holding(dp, Item("lantern"));
    expect(sel.render(v1_21_4)).toBe("@a[predicate=mypack:zzz/holding/lantern]");
  });

  it("registers the held-item predicate as a mainhand equipment check", () => {
    const dp = new Datapack("mypack", v1_21_4);
    Selector.allPlayers().holding(dp, Item("lantern"));
    const files = buildDatapack(dp);
    const json = JSON.parse(files.get("data/mypack/predicate/zzz/holding/lantern.json")!);
    expect(json).toEqual({
      condition: "minecraft:entity_properties",
      entity: "this",
      predicate: {
        equipment: { mainhand: { items: "minecraft:lantern" } },
      },
    });
  });

  it("registers one shared predicate file per item, even when used twice", () => {
    const dp = new Datapack("mypack", v1_21_4);
    Selector.allPlayers().holding(dp, Item("lantern"));
    // Second use of the same item must not throw on re-registration.
    const sel = Selector.allEntities().holding(dp, Item("lantern"));
    expect(sel.render(v1_21_4)).toBe("@e[predicate=mypack:zzz/holding/lantern]");
    expect(dp.predicateDefs.size).toBe(1);
  });

  it("composes after volume", () => {
    const dp = new Datapack("mypack", v1_21_4);
    const sel = Selector.allPlayers().volume([0, 64, 0], [4, 66, 4]).holding(dp, Item("lantern"));
    expect(sel.render(v1_21_4)).toBe(
      "@a[x=0,y=64,z=0,dx=4,dy=2,dz=4,predicate=mypack:zzz/holding/lantern]",
    );
  });
});
