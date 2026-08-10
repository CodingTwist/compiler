import { describe, it, expect } from "vitest";
import { Block } from "./block";
import { Tnt, Villager } from "./entities";
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

  it("merges sibling fields that share a parent compound", () => {
    expect(Villager({ level: 2, profession: "farmer" }).render(v1_21_4)).toBe(
      `{VillagerData:{level:2,profession:"farmer"}}`,
    );
  });

  it("merges raw keys last, for anything uncurated", () => {
    expect(Tnt({ fuse: 40 }, { Foo: 1 }).render(v1_21_4)).toBe("{fuse:40s,Foo:1}");
  });
});
