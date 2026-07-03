import { normalizeId } from "../../versions/registry";
import { ModelRef } from "./model";

/**
 * A reference to a resource-pack **model** file - either a {@link ModelRef} handed
 * back by `dp.model`/`dp.blockModel`, or a bare `<ns>:path` string. Normalized to
 * a `minecraft:`-qualified id.
 */
export type ModelResource = ModelRef | string;

function refId(ref: ModelResource): string {
  return ref instanceof ModelRef ? ref.render() : normalizeId(ref);
}

/**
 * Property ids for the `minecraft:condition` item-model arm (the boolean-valued
 * item-model property registry). Author `ItemModel.condition(CONDITION_PROPERTIES.DAMAGED, …)`
 * or pass a raw `<ns>:id` string. Hand-listed (client-side registry, absent from
 * the mcmeta server summary) - use `.raw()` if a newer one isn't here yet.
 */
export const CONDITION_PROPERTIES = {
  USING_ITEM: "minecraft:using_item",
  BROKEN: "minecraft:broken",
  DAMAGED: "minecraft:damaged",
  HAS_COMPONENT: "minecraft:has_component",
  FISHING_ROD_CAST: "minecraft:fishing_rod/cast",
  BUNDLE_HAS_SELECTED_ITEM: "minecraft:bundle/has_selected_item",
  SELECTED: "minecraft:selected",
  CARRIED: "minecraft:carried",
  EXTENDED_VIEW: "minecraft:extended_view",
  KEYBIND_DOWN: "minecraft:keybind_down",
  VIEW_ENTITY: "minecraft:view_entity",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
  COMPONENT: "minecraft:component",
} as const;

/** Property ids for the `minecraft:select` item-model arm (string/enum-valued). */
export const SELECT_PROPERTIES = {
  MAIN_HAND: "minecraft:main_hand",
  CHARGE_TYPE: "minecraft:charge_type",
  TRIM_MATERIAL: "minecraft:trim_material",
  BLOCK_STATE: "minecraft:block_state",
  DISPLAY_CONTEXT: "minecraft:display_context",
  LOCAL_TIME: "minecraft:local_time",
  CONTEXT_DIMENSION: "minecraft:context_dimension",
  CONTEXT_ENTITY_TYPE: "minecraft:context_entity_type",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
  COMPONENT: "minecraft:component",
} as const;

/** Property ids for the `minecraft:range_dispatch` item-model arm (number-valued). */
export const RANGE_DISPATCH_PROPERTIES = {
  BUNDLE_FULLNESS: "minecraft:bundle/fullness",
  DAMAGE: "minecraft:damage",
  COUNT: "minecraft:count",
  COOLDOWN: "minecraft:cooldown",
  CROSSBOW_PULL: "minecraft:crossbow/pull",
  TIME: "minecraft:time",
  COMPASS: "minecraft:compass",
  USE_CYCLE: "minecraft:use_cycle",
  USE_DURATION: "minecraft:use_duration",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
} as const;

/** Type ids for the `minecraft:tint_source` registry (see {@link TintSource}). */
export const TINT_SOURCES = {
  CONSTANT: "minecraft:constant",
  DYE: "minecraft:dye",
  GRASS: "minecraft:grass",
  FIREWORK: "minecraft:firework",
  POTION: "minecraft:potion",
  MAP_COLOR: "minecraft:map_color",
  TEAM: "minecraft:team",
  CUSTOM_MODEL_DATA: "minecraft:custom_model_data",
  COMPONENT: "minecraft:component",
} as const;

/** Type ids for the `minecraft:special_model_type` registry (see {@link SpecialModel}). */
export const SPECIAL_MODEL_TYPES = {
  BED: "minecraft:bed",
  BANNER: "minecraft:banner",
  CONDUIT: "minecraft:conduit",
  CHEST: "minecraft:chest",
  HEAD: "minecraft:head",
  SHULKER_BOX: "minecraft:shulker_box",
  SHIELD: "minecraft:shield",
  TRIDENT: "minecraft:trident",
  DECORATED_POT: "minecraft:decorated_pot",
  STANDING_SIGN: "minecraft:standing_sign",
  HANGING_SIGN: "minecraft:hanging_sign",
} as const;

/**
 * A **tint source** (`minecraft:tint_source`) - one entry of a
 * {@link ItemModel.model} `tints` array, colouring a texture layer. Static
 * constructors mirror the vanilla registry; `.raw()` is the escape hatch for a
 * shape not modelled here.
 *
 *   ItemModel.model(m, [TintSource.dye(0xFFFFFF)])
 */
export class TintSource {
  private constructor(private readonly data: Record<string, unknown>) {}

  private static of(type: string, rest: Record<string, unknown> = {}): TintSource {
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
  static customModelData(index: number, fallback: number | [number, number, number]): TintSource {
    return TintSource.of(TINT_SOURCES.CUSTOM_MODEL_DATA, { index, default: fallback });
  }
  /** Verbatim tint-source JSON escape hatch. */
  static raw(json: Record<string, unknown>): TintSource {
    return new TintSource(json);
  }

  toJson(): Record<string, unknown> {
    return this.data;
  }
}

/**
 * A **special model** (`minecraft:special_model_type`) - the inner `model` of the
 * {@link ItemModel.special} arm, rendering a hardcoded block-entity model (bed,
 * banner, chest, …). Static constructors mirror the registry; `.raw()` escapes.
 */
export class SpecialModel {
  private constructor(private readonly data: Record<string, unknown>) {}

  private static of(type: string, rest: Record<string, unknown> = {}): SpecialModel {
    return new SpecialModel({ type: normalizeId(type), ...rest });
  }

  static bed(texture: string): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.BED, { texture: normalizeId(texture) });
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
  static head(kind: string, opts: { texture?: string; animation?: number } = {}): SpecialModel {
    return SpecialModel.of(SPECIAL_MODEL_TYPES.HEAD, {
      kind,
      ...(opts.texture !== undefined ? { texture: normalizeId(opts.texture) } : {}),
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
      ...(opts.orientation !== undefined ? { orientation: opts.orientation } : {}),
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

/** One `minecraft:select` case: render `model` when the property matches `when`. */
export interface SelectCase {
  when: string | string[];
  model: ItemModel;
}

/** One `minecraft:range_dispatch` entry: render `model` at/above `threshold`. */
export interface RangeEntry {
  threshold: number;
  model: ItemModel;
}

/**
 * The client **item model** - the tagged union under an item definition's `model`
 * field (`assets/<ns>/items/<name>.json`), selecting how a stack renders. Mirrors
 * the full vanilla schema (misode's `assets/item/` generator): a flat
 * {@link ItemModel.model}, or one of the branching arms (`composite` / `condition`
 * / `select` / `range_dispatch`), the terminals (`empty` / `bundle/selected_item`),
 * or a `special` block-entity model. Every arm has a `.raw()` sibling escape hatch;
 * registered via `dp.itemDefinition(name, model)` (or emitted by `dp.model` for the
 * flat case). All model-resource fields accept a {@link ModelRef} or a `<ns>:path`.
 *
 *   ItemModel.rangeDispatch("minecraft:damage", [
 *     { threshold: 0, model: ItemModel.model("ns:item/sword") },
 *     { threshold: 0.5, model: ItemModel.model("ns:item/sword_cracked") },
 *   ])
 */
export class ItemModel {
  private constructor(private readonly data: Record<string, unknown>) {}

  private static of(type: string, rest: Record<string, unknown>): ItemModel {
    return new ItemModel({ type: normalizeId(type), ...rest });
  }

  /** Flat sprite/model with optional per-layer `tints` - the common case. */
  static model(ref: ModelResource, tints?: TintSource[]): ItemModel {
    return ItemModel.of("minecraft:model", {
      model: refId(ref),
      ...(tints && tints.length ? { tints: tints.map((t) => t.toJson()) } : {}),
    });
  }

  /** Render every sub-model on top of one another. */
  static composite(models: ItemModel[]): ItemModel {
    return ItemModel.of("minecraft:composite", { models: models.map((m) => m.toJson()) });
  }

  /**
   * Boolean branch on `property` (see {@link CONDITION_PROPERTIES}); `opts` carries
   * that property's extra fields (e.g. `{ component }` for `has_component`,
   * `{ keybind }` for `keybind_down`, `{ index }` for `custom_model_data`).
   */
  static condition(
    property: string,
    onTrue: ItemModel,
    onFalse: ItemModel,
    opts: Record<string, unknown> = {},
  ): ItemModel {
    return ItemModel.of("minecraft:condition", {
      property: normalizeId(property),
      ...opts,
      on_true: onTrue.toJson(),
      on_false: onFalse.toJson(),
    });
  }

  /**
   * Match `property` (see {@link SELECT_PROPERTIES}) against `cases`; `opts` carries
   * that property's extra fields (e.g. `{ block_state_property }` for `block_state`).
   */
  static select(
    property: string,
    cases: SelectCase[],
    fallback?: ItemModel,
    opts: Record<string, unknown> = {},
  ): ItemModel {
    return ItemModel.of("minecraft:select", {
      property: normalizeId(property),
      ...opts,
      cases: cases.map((c) => ({ when: c.when, model: c.model.toJson() })),
      ...(fallback ? { fallback: fallback.toJson() } : {}),
    });
  }

  /**
   * Numeric threshold dispatch on `property` (see {@link RANGE_DISPATCH_PROPERTIES}).
   * `opts.scale` multiplies the raw value; `opts.fallback` renders below the lowest
   * threshold; any other key is a property-specific field.
   */
  static rangeDispatch(
    property: string,
    entries: RangeEntry[],
    opts: { scale?: number; fallback?: ItemModel; [k: string]: unknown } = {},
  ): ItemModel {
    const { scale, fallback, ...rest } = opts;
    return ItemModel.of("minecraft:range_dispatch", {
      property: normalizeId(property),
      ...(scale !== undefined ? { scale } : {}),
      ...rest,
      entries: entries.map((e) => ({ threshold: e.threshold, model: e.model.toJson() })),
      ...(fallback ? { fallback: fallback.toJson() } : {}),
    });
  }

  /** Render nothing. */
  static empty(): ItemModel {
    return ItemModel.of("minecraft:empty", {});
  }

  /** Render the bundle's currently-selected item. */
  static bundleSelectedItem(): ItemModel {
    return ItemModel.of("minecraft:bundle/selected_item", {});
  }

  /** A hardcoded block-entity model (`base` is the model providing the transforms). */
  static special(base: ModelResource, model: SpecialModel): ItemModel {
    return ItemModel.of("minecraft:special", { base: refId(base), model: model.toJson() });
  }

  /** Verbatim item-model JSON escape hatch (wins over the typed arms). */
  static raw(json: Record<string, unknown>): ItemModel {
    return new ItemModel(json);
  }

  toJson(): Record<string, unknown> {
    return this.data;
  }
}
