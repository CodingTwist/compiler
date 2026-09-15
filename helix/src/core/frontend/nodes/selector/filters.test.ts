import { describe, it, expect } from "vitest";
import { Selector } from "./index";
import { PredicateRef } from "../../../values/predicate";
import { Id } from "../../../values/id";

describe("SelectorFilters", () => {
  it("normalizes volume corners given in any order, including negative and fractional ones", () => {
    expect(
      Selector.allEntities().volume([1, 5, -3], [-2.5, 10, 3]).toString(),
    ).toBe("@e[x=-2.5,y=5,z=-3,dx=3.5,dy=5,dz=6]");
  });

  it("renders a predicate from a ref, an Id, or a bare string defaulting to minecraft:", () => {
    const sel = Selector.self()
      .predicate(new PredicateRef("p:held"))
      .predicate(Id("p:sneaking"))
      .predicate("on_fire");
    expect(sel.toString()).toBe(
      "@s[predicate=p:held,predicate=p:sneaking,predicate=minecraft:on_fire]",
    );
  });

  it("rejects combining a volume/span with a yBand, since both set y/dy", () => {
    expect(() =>
      Selector.allEntities()
        .volume([0, 0, 0], [1, 1, 1])
        .yBand(5, 2)
        .toString(),
    ).toThrow(/both a volume\/span and a yBand/);
    expect(() =>
      Selector.allEntities().span(1, 1, 1).yBand(5, 2).toString(),
    ).toThrow(/both a volume\/span and a yBand/);
  });
});
