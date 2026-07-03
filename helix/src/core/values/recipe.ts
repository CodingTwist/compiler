import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";
import { ItemValue } from "./item";
import { IdValue } from "./id";
import { normalizeId } from "../../versions/registry";

/**
 * The 1.20.5 data version: recipes flip from `{item: id}` ingredients + `{item,count}`
 * results to flat id-string ingredients + `{id,count}` results (the components era).
 */
const RECIPE_FLAT_DATA_VERSION = 3837;

/** Anything usable as a recipe ingredient: an item/tag id string, an {@link ItemValue}, or an {@link IdValue}. */
export type Ingredient = string | ItemValue | IdValue;

/** Normalize an ingredient to its id string (`minecraft:stick`, `#minecraft:planks`). */
function ingredientId(ing: Ingredient): string {
  if (ing instanceof ItemValue) return ing.baseId();
  if (ing instanceof IdValue) return ing.render();
  return ing.startsWith("#") ? "#" + normalizeId(ing.slice(1)) : normalizeId(ing);
}

/** Render one ingredient: a flat id string (1.20.5+) or a `{item|tag: id}` object (pre). */
function renderIngredient(ing: Ingredient, version: VersionProfile): unknown {
  const id = ingredientId(ing);
  if (version.dataVersion >= RECIPE_FLAT_DATA_VERSION) return id;
  return id.startsWith("#") ? { tag: id.slice(1) } : { item: id };
}

/** Render a recipe result: `{id|item, count}`, version-aware on the key. */
function renderResult(result: Ingredient, count: number, version: VersionProfile): Record<string, unknown> {
  const key = version.dataVersion >= RECIPE_FLAT_DATA_VERSION ? "id" : "item";
  return { [key]: ingredientId(result), count };
}

/**
 * A registerable **recipe** - the JSON written to `data/<ns>/<recipe folder>/<name>.json`
 * (via `Datapack.recipe`). Built from typed {@link ItemValue}/{@link IdValue}
 * ingredients, rendered version-aware (the 1.20.5 ingredient/result format change is
 * handled for you).
 *
 *   dp.recipe("ruby_block", RecipeDef.shaped(
 *     ["###", "###", "###"], { "#": Item.of("mypack:ruby") }, Item.of("mypack:ruby_block")));
 */
export class RecipeDef {
  private constructor(private readonly build: (v: VersionProfile) => Record<string, unknown>) {}

  /** The recipe JSON, with embedded ingredients rendered for `version`. */
  toJson(version: VersionProfile): Record<string, unknown> {
    return this.build(version);
  }

  /** `minecraft:crafting_shaped` - a grid `pattern` keyed by single-char ingredients. */
  static shaped(
    pattern: string[],
    key: Record<string, Ingredient>,
    result: Ingredient,
    count = 1,
  ): RecipeDef {
    return new RecipeDef((v) => ({
      type: "minecraft:crafting_shaped",
      pattern,
      key: Object.fromEntries(
        Object.entries(key).map(([k, ing]) => [k, renderIngredient(ing, v)]),
      ),
      result: renderResult(result, count, v),
    }));
  }

  /** `minecraft:crafting_shapeless` - an unordered list of ingredients. */
  static shapeless(ingredients: Ingredient[], result: Ingredient, count = 1): RecipeDef {
    return new RecipeDef((v) => ({
      type: "minecraft:crafting_shapeless",
      ingredients: ingredients.map((ing) => renderIngredient(ing, v)),
      result: renderResult(result, count, v),
    }));
  }

  /**
   * A cooking recipe: `minecraft:smelting` (default), `blasting`, `smoking`, or
   * `campfire_cooking`. `experience`/`cookingtime` default to 0.1 / 200.
   */
  static cooking(
    ingredient: Ingredient,
    result: Ingredient,
    opts: {
      type?: "smelting" | "blasting" | "smoking" | "campfire_cooking";
      experience?: number;
      cookingtime?: number;
    } = {},
  ): RecipeDef {
    return new RecipeDef((v) => ({
      type: `minecraft:${opts.type ?? "smelting"}`,
      ingredient: renderIngredient(ingredient, v),
      result: renderResult(result, 1, v),
      experience: opts.experience ?? 0.1,
      cookingtime: opts.cookingtime ?? 200,
    }));
  }

  /** `minecraft:stonecutting` - one ingredient to `count` of a result. */
  static stonecutting(ingredient: Ingredient, result: Ingredient, count = 1): RecipeDef {
    return new RecipeDef((v) => ({
      type: "minecraft:stonecutting",
      ingredient: renderIngredient(ingredient, v),
      result: renderResult(result, count, v),
    }));
  }

  /** `minecraft:smithing_transform` - template + base + addition → result (1.20+ smithing). */
  static smithingTransform(
    template: Ingredient,
    base: Ingredient,
    addition: Ingredient,
    result: Ingredient,
  ): RecipeDef {
    return new RecipeDef((v) => ({
      type: "minecraft:smithing_transform",
      template: renderIngredient(template, v),
      base: renderIngredient(base, v),
      addition: renderIngredient(addition, v),
      result: renderResult(result, 1, v),
    }));
  }

  /** Escape hatch: a recipe by type id with already-built fields. */
  static of(type: string, fields: Record<string, unknown>): RecipeDef {
    return new RecipeDef(() => ({ type: normalizeId(type), ...fields }));
  }
}

/** A reference to a registered recipe (`<ns>:name`). */
export class RecipeRef implements CommandValue {
  constructor(readonly id: string) {}
  render(): string {
    return this.id;
  }
}
