import { describe, it, expect } from "vitest";
import { Selector } from "../frontend/nodes/selector";
import { renderSelector } from "./selector";
import { Nbt } from "../values/nbt";
import { v1_21_4 } from "../../versions/1_21_4";

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

  it("throws if an nbt selector is rendered without a version (toString)", () => {
    const sel = Selector.allPlayers().nbt(Nbt({ SelectedItem: { id: "minecraft:lantern" } }));
    expect(() => sel.toString()).toThrow(/requires a version/);
  });
});
