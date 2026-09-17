/**
 * The `apply_impulse` enchantment JSON and the predicates for `player_motion`, under the
 * consuming pack's namespace `ns`.
 */

import { Predicate, type VersionProfile } from "helix";

/** The dummy marker entity's fixed UUID (`d4bd74a7-4e82-4a07-8850-dfc4d89f9e2f`). */
export const MARKER_UUID = "d4bd74a7-4e82-4a07-8850-dfc4d89f9e2f";

/** The shared store objective every enchantment effect reads its bit from. */
const STORE = "player_motion.internal.store";

/** `0.0001 * 2^bit` as an exact decimal, bit 31 negative (the sign bit). */
export function magnitude(bit: number): number {
  return (bit === 31 ? -(2 ** 31) : 2 ** bit) / 10000;
}

/** The data-driven `apply_impulse` enchantment: one effect per axis per bit. */
export function enchantmentJson(resetFn: string, v: VersionProfile): unknown {
  const axes: [string, [number, number, number]][] = [
    ["x", [1, 0, 0]],
    ["y", [0, 1, 0]],
    ["z", [0, 0, 1]],
  ];
  const effects: unknown[] = [
    {
      effect: {
        type: "minecraft:run_function",
        function: resetFn,
      },
    },
  ];
  for (const [axis, direction] of axes) {
    for (let bit = 31; bit >= 0; bit--) {
      effects.push({
        requirements: Predicate.scoreValue(`#${axis}.${bit}`, STORE, 1).toJson(v),
        effect: {
          type: "minecraft:apply_impulse",
          direction,
          coordinate_scale: [1, 1, 1],
          magnitude: magnitude(bit),
        },
      });
    }
  }
  return {
    description: "",
    supported_items: ["minecraft:saddle"],
    weight: 1,
    max_level: 1,
    min_cost: { base: 0, per_level_above_first: 0 },
    max_cost: { base: 0, per_level_above_first: 0 },
    anvil_cost: 0,
    slots: ["saddle"],
    effects: { "minecraft:location_changed": effects },
  };
}

/** `internal/large_global` - true when any input axis is outside [-12398, 12398]. */
export const largeGlobal = Predicate.any(
  ...["$x", "$y", "$z"].map((name) =>
    Predicate.scoreValue(name, "player_motion.api.launch", {
      min: -12398,
      max: 12398,
    }).not(),
  ),
);

/** `internal/falling_creative_player` - a creative player that is falling. */
export const fallingCreative = Predicate.entity({
  flags: { is_on_ground: false, is_flying: false },
});
