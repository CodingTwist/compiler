import { describe, it, expect } from "vitest";
import { Selector } from "../frontend/nodes/selector";
import { renderSelector } from "./selector";
import { Nbt } from "../values/nbt";
import { v1_21_4 } from "../../versions/profiles";
import { EntityType } from "../values/resource.generated";

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
    expect(Selector.allEntities().type("#tunnel:removable").toString()).toBe(
      "@e[type=#tunnel:removable]",
    );
  });

  it("renders a partial vertical band (y/dy, no x/z)", () => {
    expect(Selector.self().yBand(-30, -100).toString()).toBe("@s[y=-30,dy=-100]");
  });

  it("throws if an nbt selector is rendered without a version (toString)", () => {
    const sel = Selector.allPlayers().nbt(Nbt({ SelectedItem: { id: "minecraft:lantern" } }));
    expect(() => sel.toString()).toThrow(/requires a version/);
  });
});
