// `SpecialModel`: the hardcoded block-entity renderers (bed, banner, chest…) for `ItemModel.special`.
import { normalizeId } from "../../../versions/registry";
import { SPECIAL_MODEL_TYPES } from "./properties";

/**
 * A special model (bed, banner, chest…) for `ItemModel.special`. `.raw()` for others.
 */
export class SpecialModel {
  private constructor(private readonly data: Record<string, unknown>) {}

  private static of(
    type: string,
    rest: Record<string, unknown> = {},
  ): SpecialModel {
    return new SpecialModel({ type: normalizeId(type), ...rest });
  }

  static bed(texture: string): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.BED, {
      texture: normalizeId(texture),
    });
  }
  static banner(color: string): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.BANNER, { color });
  }
  static conduit(): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.CONDUIT);
  }
  static chest(texture: string, openness?: number): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.CHEST, {
      texture: normalizeId(texture),
      ...(openness !== undefined ? { openness } : {}),
    });
  }
  static head(
    kind: string,
    opts: { texture?: string; animation?: number } = {},
  ): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.HEAD, {
      kind,
      ...(opts.texture !== undefined
        ? { texture: normalizeId(opts.texture) }
        : {}),
      ...(opts.animation !== undefined ? { animation: opts.animation } : {}),
    });
  }
  static shulkerBox(
    texture: string,
    opts: { openness?: number; orientation?: string } = {},
  ): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.SHULKER_BOX, {
      texture: normalizeId(texture),
      ...(opts.openness !== undefined ? { openness: opts.openness } : {}),
      ...(opts.orientation !== undefined
        ? { orientation: opts.orientation }
        : {}),
    });
  }
  static shield(): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.SHIELD);
  }
  static trident(): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.TRIDENT);
  }
  static decoratedPot(): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.DECORATED_POT);
  }
  static standingSign(woodType: string, texture?: string): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.STANDING_SIGN, {
      wood_type: woodType,
      ...(texture !== undefined ? { texture: normalizeId(texture) } : {}),
    });
  }
  static hangingSign(woodType: string, texture?: string): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.HANGING_SIGN, {
      wood_type: woodType,
      ...(texture !== undefined ? { texture: normalizeId(texture) } : {}),
    });
  }
  /** Verbatim special-model JSON escape hatch. */
  static raw(json: Record<string, unknown>): SpecialModel {
    return new SpecialModel(json);
  }

  toJson(): Record<string, unknown> {
    return this.data;
  }
}
