/**
 * The data-resource JSON for `player_motion` - the `apply_impulse` enchantment
 * and the two predicates. Pure builders: no datapack/version state, just the
 * shapes upstream ships, so they read as data, not commands. The `ns` argument
 * is the consuming pack's namespace (helix is single-namespace, so the library
 * inlines into it rather than a `player_motion:` pack).
 */

/** The dummy marker entity's fixed UUID (`d4bd74a7-4e82-4a07-8850-dfc4d89f9e2f`). */
export const MARKER_UUID = "d4bd74a7-4e82-4a07-8850-dfc4d89f9e2f";

/** The shared store objective every enchantment effect reads its bit from. */
const STORE = "player_motion.internal.store";

/** `0.0001 * 2^bit` as an exact decimal, bit 31 negative (the sign bit). */
export function magnitude(bit: number): number {
  return (bit === 31 ? -(2 ** 31) : 2 ** bit) / 10000;
}

/** The data-driven `apply_impulse` enchantment: one effect per axis per bit. */
export function enchantmentJson(ns: string): unknown {
  const axes: [string, [number, number, number]][] = [
    ["x", [1, 0, 0]],
    ["y", [0, 1, 0]],
    ["z", [0, 0, 1]],
  ];
  const effects: unknown[] = [
    { effect: { type: "minecraft:run_function", function: `${ns}:internal/launch/reset` } },
  ];
  for (const [axis, direction] of axes) {
    for (let bit = 31; bit >= 0; bit--) {
      effects.push({
        requirements: {
          condition: "minecraft:value_check",
          value: {
            type: "minecraft:score",
            target: { type: "minecraft:fixed", name: `#${axis}.${bit}` },
            score: STORE,
          },
          range: 1,
        },
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
export function largeGlobalJson(): unknown {
  const axisTerm = (name: string) => ({
    condition: "minecraft:inverted",
    term: {
      condition: "minecraft:value_check",
      value: {
        type: "minecraft:score",
        target: { type: "minecraft:fixed", name },
        score: "player_motion.api.launch",
      },
      range: { min: -12398, max: 12398 },
    },
  });
  return { condition: "minecraft:any_of", terms: [axisTerm("$x"), axisTerm("$y"), axisTerm("$z")] };
}

/** `internal/falling_creative_player` - a creative player that is falling. */
export function fallingCreativeJson(): unknown {
  return {
    condition: "minecraft:entity_properties",
    entity: "this",
    predicate: { flags: { is_on_ground: false, is_flying: false } },
  };
}
