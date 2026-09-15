import { describe, it, expect } from "vitest";
import { v1_20_1, v1_21_4, v26_2 } from "../../../../versions/profiles";
import { MobEffect, EntityType } from "../../resource.generated";
import { renderEntitySpec } from "./entity";

describe("renderEntitySpec", () => {
  it("renders movement in snake_case and gates it at 1.21", () => {
    const spec = { movement: { horizontalSpeed: { max: 2 }, fallDistance: 3 } };
    expect(renderEntitySpec(spec, v1_21_4)).toEqual({
      movement: { horizontal_speed: { min: undefined, max: 2 }, fall_distance: 3 },
    });
    expect(() => renderEntitySpec(spec, v1_20_1)).toThrow("movement needs 1.21+");
  });

  it("renders effects, distance, periodic tick and nested targets", () => {
    expect(
      renderEntitySpec(
        {
          effects: [{ effect: MobEffect.SPEED, amplifier: { min: 1 }, visible: false }],
          distance: { horizontal: { max: 4 } },
          periodicTick: 20,
          steppingOn: { dimension: "overworld" },
          targetedEntity: { type: EntityType.PLAYER },
        },
        v1_21_4,
      ),
    ).toEqual({
      effects: { "minecraft:speed": { amplifier: { min: 1, max: undefined }, visible: false } },
      distance: { horizontal: { min: undefined, max: 4 } },
      periodic_tick: 20,
      stepping_on: { dimension: "minecraft:overworld" },
      targeted_entity: { type: "minecraft:player" },
    });
  });

  it("gates entity tags at 26.2 and type lists at 1.20.5", () => {
    expect(renderEntitySpec({ entityTags: { allOf: ["a"] } }, v26_2)).toEqual({
      entity_tags: { any_of: undefined, all_of: ["a"], none_of: undefined },
    });
    expect(() => renderEntitySpec({ entityTags: { allOf: ["a"] } }, v1_21_4)).toThrow("26.2+");
    expect(renderEntitySpec({ type: ["zombie", "husk"] }, v26_2)).toEqual({
      entity_type: ["minecraft:zombie", "minecraft:husk"],
    });
    expect(() => renderEntitySpec({ type: ["zombie"] }, v1_20_1)).toThrow("type list needs 1.20.5+");
  });
});
