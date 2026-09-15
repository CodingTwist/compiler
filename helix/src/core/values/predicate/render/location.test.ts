import { describe, it, expect } from "vitest";
import { v1_20_1, v1_21_4 } from "../../../../versions/profiles";
import { Block } from "../../block";
import { Biome } from "../../resource.generated";
import { renderLocation } from "./location";

describe("renderLocation", () => {
  it("uses biomes/structures since 1.20.5 and biome/structure before", () => {
    const spec = { biome: Biome.PLAINS, structure: "village_plains" };
    expect(renderLocation(spec, v1_21_4)).toEqual({
      biomes: "minecraft:plains",
      structures: "minecraft:village_plains",
    });
    expect(renderLocation(spec, v1_20_1)).toEqual({
      biome: "minecraft:plains",
      structure: "minecraft:village_plains",
    });
    expect(() => renderLocation({ biome: "#is_ocean" }, v1_20_1)).toThrow("biome tag needs 1.20.5+");
  });

  it("renders blocks with state, fluids, light and sky", () => {
    expect(
      renderLocation(
        {
          block: Block("furnace", { lit: true }),
          fluid: { fluids: "#water" },
          light: { min: 8 },
          canSeeSky: true,
        },
        v1_21_4,
      ),
    ).toEqual({
      block: { blocks: "minecraft:furnace", state: { lit: "true" } },
      fluid: { fluids: "#minecraft:water" },
      light: { light: { min: 8, max: undefined } },
      can_see_sky: true,
    });
    expect(renderLocation({ block: "#logs", fluid: { fluids: "#water" } }, v1_20_1)).toEqual({
      block: { tag: "minecraft:logs" },
      fluid: { tag: "minecraft:water" },
    });
    expect(() => renderLocation({ canSeeSky: true }, v1_20_1)).toThrow("canSeeSky needs 1.21+");
  });
});
