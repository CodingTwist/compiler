import { describe, it, expect } from "vitest";
import { v1_20_1, v1_21_4, v26_1_2, v26_2 } from "../../../../versions/profiles";
import { Gamemode } from "../../enums";
import { renderEntitySpec } from "./entity";

describe("typeSpecific", () => {
  const player = {
    typeSpecific: {
      type: "player" as const,
      gamemode: Gamemode.SURVIVAL,
      level: { min: 5 },
      input: { sneak: true },
    },
  };

  it("nests under type_specific with a type before 26.2", () => {
    expect(renderEntitySpec(player, v1_21_4)).toEqual({
      type_specific: {
        type: "minecraft:player",
        gamemode: ["survival"],
        level: { min: 5, max: undefined },
        input: { sneak: true },
      },
    });
  });

  it("uses a type_specific/<x> key since 26.2, and cube_mob for slimes", () => {
    expect(renderEntitySpec(player, v26_2)).toMatchObject({
      "type_specific/player": { gamemode: ["survival"] },
    });
    expect(renderEntitySpec({ typeSpecific: { type: "slime", size: 2 } }, v26_2)).toEqual({
      "type_specific/cube_mob": { size: 2 },
    });
  });

  it("uses a bare type and a single gamemode on old versions", () => {
    const old = { typeSpecific: { type: "player" as const, gamemode: Gamemode.CREATIVE } };
    expect(renderEntitySpec(old, v1_20_1)).toEqual({
      type_specific: { type: "player", gamemode: "creative" },
    });
    expect(() => renderEntitySpec(player, v1_20_1)).toThrow("input needs 1.21.2+");
  });

  it("gates new player fields and removed variant checks", () => {
    const food = { typeSpecific: { type: "player" as const, food: { level: { max: 6 } } } };
    expect(() => renderEntitySpec(food, v1_21_4)).toThrow("food needs 26.1+");
    expect(renderEntitySpec(food, v26_1_2)).toMatchObject({
      type_specific: { food: { level: { max: 6 } } },
    });
    const cat = { typeSpecific: { type: "cat" as const, variant: "minecraft:black" } };
    expect(renderEntitySpec(cat, v1_21_4)).toEqual({
      type_specific: { type: "minecraft:cat", variant: "minecraft:black" },
    });
    expect(() => renderEntitySpec(cat, v26_1_2)).toThrow("was removed in 1.21.5");
  });
});
