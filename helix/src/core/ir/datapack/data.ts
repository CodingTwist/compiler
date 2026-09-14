// `Datapack` layer: data pack registries (predicates, advancements, loot, recipes, biomes).
// Each returns a typed ref; codegen reads the `*Defs` getters.
import type { FunctionContext } from "../../frontend/context";
import { FunctionRef } from "../../function_ref";
import { Predicate, PredicateRef } from "../../values/predicate";
import { AdvancementDef, Trigger } from "../../values/advancement";
import { Selector } from "../../frontend/nodes/selector";
import { Advancement, Biome } from "../../values/resource.generated";
import { BiomeDef } from "../../values/biome";
import { LootTableDef, LootTableRef } from "../../values/loot-table";
import { ItemModifier, ItemModifierRef } from "../../values/item-modifier";
import { RecipeDef, RecipeRef } from "../../values/recipe";
import { DatapackTags } from "./tags";

/**
 * Splits a definition name into namespace and path. A namespaced name writes into that
 * namespace,
 * which is how packs override vanilla resources.
 */
export function splitDefName(
  dp: { name: string },
  name: string,
): { namespace: string; path: string } {
  const colon = name.indexOf(":");
  if (colon === -1) return { namespace: dp.name, path: name };
  return { namespace: name.slice(0, colon), path: name.slice(colon + 1) };
}

export class DatapackData extends DatapackTags {
  private predicates = new Map<string, Predicate>();
  private advancements = new Map<string, AdvancementDef>();
  private lootTables = new Map<string, LootTableDef>();
  private itemModifiers = new Map<string, ItemModifier>();
  private recipes = new Map<string, RecipeDef>();
  // Keyed by the name as authored, which may include a namespace.
  private biomes = new Map<string, BiomeDef>();

  /**
   * Registers a {@link Predicate} and returns its ref for `Selector.predicate` or
   * `predicateCheck`.
   * The same name with a different object throws.
   */
  predicate(name: string, predicate: Predicate): PredicateRef {
    this.registerDef(this.predicates, "Predicate", name, predicate);
    return new PredicateRef(`${this.name}:${name}`);
  }

  /** Registered predicates (name → definition), for codegen. */
  get predicateDefs(): ReadonlyMap<string, Predicate> {
    return this.predicates;
  }

  /**
   * Registers an {@link AdvancementDef} and returns its id. The same name with a different
   * object throws.
   */
  advancement(name: string, def: AdvancementDef): Advancement {
    this.registerDef(this.advancements, "Advancement", name, def);
    return Advancement(`${this.name}:${name}`);
  }

  /** Registered advancements (name → definition), for codegen. */
  get advancementDefs(): ReadonlyMap<string, AdvancementDef> {
    return this.advancements;
  }

  /**
   * A repeatable event: `body` runs as the player every time `trigger` fires.
   *
   * Emits the advancement and a reward function that revokes it, so it can't be left firing
   * only once:
   *
   *   dp.event(Trigger.consumeItem(Item.CHORUS_FRUIT), (ctx) => { ... });
   *
   * Only pass a name if something grants or revokes the advancement by id.
   * For conditions you could test on a tick, use a {@link Predicate} instead.
   */
  event(trigger: Trigger, body: (ctx: FunctionContext) => void): { advancement: Advancement; fn: FunctionRef };
  event(name: string, trigger: Trigger, body: (ctx: FunctionContext) => void): { advancement: Advancement; fn: FunctionRef };
  event(
    ...args: [Trigger, (ctx: FunctionContext) => void] | [string, Trigger, (ctx: FunctionContext) => void]
  ): { advancement: Advancement; fn: FunctionRef } {
    const [name, trigger, body] = args.length === 3 ? args : [undefined, ...args];
    const fn = this.createFunction(name);
    const path = fn.getName();
    const advancement = this.advancement(
      path,
      new AdvancementDef().criterion("trigger", trigger).reward(`${this.name}:${path}`),
    );
    fn.build((ctx) => {
      body(ctx);
      ctx.advancement().revokeOnly(Selector.self(), advancement);
    });
    return { advancement, fn };
  }

  /** Registers a {@link LootTableDef} and returns its ref. */
  lootTable(name: string, table: LootTableDef): LootTableRef {
    this.registerDef(this.lootTables, "Loot table", name, table);
    return new LootTableRef(`${this.name}:${name}`);
  }

  /** Registered loot tables (name → definition), for codegen. */
  get lootTableDefs(): ReadonlyMap<string, LootTableDef> {
    return this.lootTables;
  }

  /** Registers an {@link ItemModifier} and returns its ref for `/item modify`. */
  itemModifier(name: string, modifier: ItemModifier): ItemModifierRef {
    this.registerDef(this.itemModifiers, "Item modifier", name, modifier);
    return new ItemModifierRef(`${this.name}:${name}`);
  }

  /** Registered item modifiers (name → definition), for codegen. */
  get itemModifierDefs(): ReadonlyMap<string, ItemModifier> {
    return this.itemModifiers;
  }

  /** Registers a {@link RecipeDef} and returns its ref for `/recipe give|take`. */
  recipe(name: string, recipe: RecipeDef): RecipeRef {
    this.registerDef(this.recipes, "Recipe", name, recipe);
    return new RecipeRef(`${this.name}:${name}`);
  }

  /** Registered recipes (name → definition), for codegen. */
  get recipeDefs(): ReadonlyMap<string, RecipeDef> {
    return this.recipes;
  }

  /**
   * Registers a {@link BiomeDef} and returns its id.
   *
   * A namespaced name writes outside this pack, which is how you replace a vanilla biome:
   *
   *   dp.biome("sky/void", def)         -> data/mypack/worldgen/biome/sky/void.json
   *   dp.biome("minecraft:plains", def) -> data/minecraft/worldgen/biome/plains.json
   */
  biome(name: string, def: BiomeDef): Biome {
    this.registerDef(this.biomes, "Biome", name, def);
    const { namespace, path } = splitDefName(this, name);
    return Biome(`${namespace}:${path}`);
  }

  /** Registered biomes (name as authored → definition), for codegen. */
  get biomeDefs(): ReadonlyMap<string, BiomeDef> {
    return this.biomes;
  }
}
