// `TintSource`: per-layer colour for an item model's `tints`.
import { normalizeId } from "../../../versions/registry";
import { TINT_SOURCES } from "./properties";

/**
 * A tint source for an item model's `tints`. `.raw()` for unmodelled shapes.
 *
 *   ItemModel.model(m, [TintSource.dye(0xFFFFFF)])
 */
export class TintSource {
  private constructor(private readonly data: Record<string, unknown>) {}

  private static of(
    type: string,
    rest: Record<string, unknown> = {},
  ): TintSource {
    return new TintSource({ type: normalizeId(type), ...rest });
  }

  /** Fixed colour (`value` is a packed RGB int or `[r,g,b]` floats). */
  static constant(value: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.CONSTANT, { value });
  }
  /** Dyed-armour colour, `default` when undyed. */
  static dye(fallback: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.DYE, { default: fallback });
  }
  /** Biome grass colour at the given climate. */
  static grass(temperature: number, downfall: number): TintSource {
    return TintSource.of(TINT_SOURCES.GRASS, { temperature, downfall });
  }
  static firework(fallback: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.FIREWORK, { default: fallback });
  }
  static potion(fallback: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.POTION, { default: fallback });
  }
  static mapColor(fallback: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.MAP_COLOR, { default: fallback });
  }
  static team(fallback: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.TEAM, { default: fallback });
  }
  /** `custom_model_data` float at `index`, `default` when absent. */
  static customModelData(
    index: number,
    fallback: number | [number, number, number],
  ): TintSource {
    return TintSource.of(TINT_SOURCES.CUSTOM_MODEL_DATA, {
      index,
      default: fallback,
    });
  }
  /** Verbatim tint-source JSON escape hatch. */
  static raw(json: Record<string, unknown>): TintSource {
    return new TintSource(json);
  }

  toJson(): Record<string, unknown> {
    return this.data;
  }
}
