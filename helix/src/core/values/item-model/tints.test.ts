import { describe, it, expect } from "vitest";
import { TintSource, SpecialModel } from ".";

describe("TintSource / SpecialModel", () => {
  it("tint sources carry their fields and normalize ids", () => {
    expect(TintSource.constant([1, 0, 0]).toJson()).toEqual({
      type: "minecraft:constant",
      value: [1, 0, 0],
    });
    expect(TintSource.grass(0.5, 0.4).toJson()).toEqual({
      type: "minecraft:grass",
      temperature: 0.5,
      downfall: 0.4,
    });
    expect(TintSource.customModelData(2, 0x00ff00).toJson()).toEqual({
      type: "minecraft:custom_model_data",
      index: 2,
      default: 0x00ff00,
    });
  });

  it("special models carry their fields; conduit/shield are bare", () => {
    expect(SpecialModel.chest("ns:chest", 0.5).toJson()).toEqual({
      type: "minecraft:chest",
      texture: "ns:chest",
      openness: 0.5,
    });
    expect(SpecialModel.conduit().toJson()).toEqual({
      type: "minecraft:conduit",
    });
    expect(SpecialModel.standingSign("oak").toJson()).toEqual({
      type: "minecraft:standing_sign",
      wood_type: "oak",
    });
  });
});
