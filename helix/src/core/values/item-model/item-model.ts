// `ItemModel`: how a stack renders, as a flat model or a branching arm.
import { normalizeId } from "../../../versions/registry";
import { ModelRef } from "../model";
import type { SpecialModel } from "./special-model";
import type { TintSource } from "./tint-source";

/** A resource pack model reference: a {@link ModelRef} or a `<ns>:path` string. */
export type ModelResource = ModelRef | string;

function refId(ref: ModelResource): string {
  return ref instanceof ModelRef ? ref.render() : normalizeId(ref);
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
 * An item model: how a stack renders, under an item definition's `model` field.
 *
 * A flat {@link ItemModel.model} or a branching arm (`composite`, `condition`, `select`,
 * `range_dispatch`), plus `empty`, `bundle/selected_item` and `special`. Each has a
 * `.raw()`.
 * Register with `dp.itemDefinition(name, model)`.
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
   * Branches on a boolean `property`. `opts` holds its extra fields, e.g. `{ component }`.
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

  /** Matches `property` against `cases`. `opts` holds its extra fields. */
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
   * Picks a model by numeric threshold on `property`. `opts.scale` scales the value,
   * `opts.fallback` renders below the lowest threshold.
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
