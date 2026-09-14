// Middle of `Datapack`: data and resource pack registries. Each returns a typed ref;
// codegen reads the `*Defs` getters.
import type { FunctionContext } from "../frontend/context";
import { FunctionRef } from "../function_ref";
import { Predicate, PredicateRef } from "../values/predicate";
import { AdvancementDef, Trigger } from "../values/advancement";
import { Selector } from "../frontend/nodes/selector";
import { Advancement, Biome, EntityType, FunctionId } from "../values/resource.generated";
import { FunctionTagRef } from "../values/function-tag";
import { BiomeDef } from "../values/biome";
import { LootTableDef, LootTableRef } from "../values/loot-table";
import { ItemModifier, ItemModifierRef } from "../values/item-modifier";
import { RecipeDef, RecipeRef } from "../values/recipe";
import { Model, ModelRef } from "../values/model";
import { ItemModel } from "../values/item-model";
import { BlockState } from "../values/block-state";
import { normalizeId } from "../../versions/registry";
import { DatapackCore } from "./datapack-core";

/** A registry tag's registered body: its members and whether it replaces inherited ones. */
export interface RegistryTag {
  /** The registry this tag belongs to (`block`, `item`, `fluid`, `entity_type`, ...). */
  registry: string;
  /** Member ids / `#tag` references. */
  values: string[];
  /** `replace: true` to discard members contributed by lower-priority packs. */
  replace: boolean;
}

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

/** A registered item definition (`assets/<ns>/items/<name>.json`). */
export interface ItemDefinition {
  /** The client item-model union selecting how the stack renders. */
  model: ItemModel;
  /** Optional top-level item-definition flags (default vanilla behaviour when omitted). */
  options?: { handAnimationOnSwap?: boolean; oversizedInGui?: boolean };
}

/** Render an {@link ItemDefinition} to its `assets/<ns>/items/<name>.json` JSON. */
export function serializeItemDef(def: ItemDefinition): Record<string, unknown> {
  const o = def.options;
  return {
    model: def.model.toJson(),
    ...(o?.handAnimationOnSwap !== undefined
      ? { hand_animation_on_swap: o.handAnimationOnSwap }
      : {}),
    ...(o?.oversizedInGui !== undefined ? { oversized_in_gui: o.oversizedInGui } : {}),
  };
}

export class DatapackResources extends DatapackCore {
  private predicates = new Map<string, Predicate>();
  private advancements = new Map<string, AdvancementDef>();
  private lootTables = new Map<string, LootTableDef>();
  private itemModifiers = new Map<string, ItemModifier>();
  private recipes = new Map<string, RecipeDef>();
  // Keyed by the name as authored, which may include a namespace.
  private biomes = new Map<string, BiomeDef>();
  // Registry tags, keyed `<registry>/<name>`. Separate from function tags.
  private registryTags = new Map<string, RegistryTag>();
  // Raw JSON for types without a builder, keyed `<folder>/<name>`.
  private registryFiles = new Map<string, unknown>();
  // Resource pack models by name; raw assets by `<folder>/<name>`; copied asset dirs.
  private models = new Map<string, Model>();
  // Item definitions by name: flat ones from `dp.model`, full ones from
  // `dp.itemDefinition`.
  private itemDefinitions = new Map<string, ItemDefinition>();
  // Block models by name; block states by the block id they override.
  private blockModels = new Map<string, Model>();
  private blockStates = new Map<string, BlockState>();
  private resourceFiles = new Map<string, unknown>();
  private assetDirs: string[] = [];

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
   *   dp.event("exit/eat_chorus", Trigger.consumeItem(Item.CHORUS_FRUIT),
   *     (ctx) => { ... });
   *
   * For conditions you could test on a tick, use a {@link Predicate} instead.
   */
  event(
    name: string,
    trigger: Trigger,
    body: (ctx: FunctionContext) => void,
  ): { advancement: Advancement; fn: FunctionRef } {
    const fn = this.createFunction(name);
    const advancement = this.advancement(
      name,
      new AdvancementDef().criterion("trigger", trigger).reward(`${this.name}:${name}`),
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

  /**
   * Registers a registry tag (`block`, `item`, `entity_type`…). Registering again appends.
   * `replace: true` drops members from lower-priority packs.
   */
  tag(
    registry: string,
    name: string,
    spec: { values: string[]; replace?: boolean },
  ): void {
    const key = `${registry}/${name}`;
    const existing = this.registryTags.get(key);
    if (existing) {
      existing.values.push(...spec.values);
      if (spec.replace) existing.replace = true;
      return;
    }
    this.registryTags.set(key, {
      registry,
      values: [...spec.values],
      replace: spec.replace ?? false,
    });
  }

  /** Registered registry tags (`<registry>/<name>` → body), for codegen. */
  get registryTagDefs(): ReadonlyMap<string, RegistryTag> {
    return this.registryTags;
  }

  /**
   * Declares a function tag and returns a ref for `ctx.callTag(...)` / `schedule`.
   * Members are {@link FunctionRef}s, so they must exist. Registering again appends.
   */
  functionTag(
    name: string,
    spec: { values: FunctionRef[]; replace?: boolean } = { values: [] },
  ): FunctionTagRef {
    this.tag("function", name, {
      values: spec.values.map((ref) => this.idOf(ref).render()),
      replace: spec.replace,
    });
    return FunctionTagRef(this.name, name);
  }

  /**
   * Declares an entity type tag and returns it as a type for `Selector.type(...)`, so one
   * selector can match several types. Registering again appends.
   */
  entityTypeTag(name: string, types: readonly EntityType[]): EntityType {
    const known = this.registryTags.get(`entity_type/${name}`)?.values ?? [];
    this.tag("entity_type", name, { values: [...new Set(types.map((t) => t.render()))].filter((t) => !known.includes(t)) });
    return EntityType(`#${this.name}:${name}`);
  }

  /** The typed id (`<ns>:<name>`) of a function in this pack. */
  idOf(ref: FunctionRef): FunctionId {
    return FunctionId(`${this.name}:${ref.getName()}`);
  }

  /**
   * Escape hatch for data types without a builder: writes `json` to
   * `data/<ns>/<folder>/<name>.json`.
   */
  registryFile(folder: string, name: string, json: unknown): void {
    this.registryFiles.set(`${folder}/${name}`, json);
  }

  /** Registered raw registry files (`<folder>/<name>` → JSON), for codegen. */
  get registryFileDefs(): ReadonlyMap<string, unknown> {
    return this.registryFiles;
  }

  // --- Resource pack (assets/) --------------------------------------------
  // Written by writeResourcePack, not writeDatapack; a resource pack is a separate pack.

  /**
   * Registers a {@link Model} and (1.21.4+) its item definition, returning a ref for
   * `Item.X.model(ref)`.
   * `legacyModelData` also supports versions before `item_model`. A different model under
   * the same name throws.
   */
  model(name: string, def: Model, legacyModelData?: number): ModelRef {
    this.registerDef(this.models, "Model", name, def);
    // Register through `itemDefinition` so codegen has one source.
    return this.itemDefinition(
      name,
      ItemModel.model(`${this.name}:item/${name}`),
      undefined,
      legacyModelData,
    );
  }

  /** Registered models (name → definition), for resource-pack codegen. */
  get modelDefs(): ReadonlyMap<string, Model> {
    return this.models;
  }

  /**
   * Registers a full {@link ItemModel} item definition (1.21.4+) and returns a ref for
   * `Item.X.model(ref)`.
   *
   * For branching models and tints; {@link model} is the simple case. Referenced models
   * must come
   * from {@link model}, {@link blockModel} or {@link addAssets}.
   */
  itemDefinition(
    name: string,
    model: ItemModel,
    options?: ItemDefinition["options"],
    legacyModelData?: number,
  ): ModelRef {
    const def: ItemDefinition = { model, options };
    const existing = this.itemDefinitions.get(name);
    // Compare rendered JSON, since `model()` builds a new wrapper each call.
    if (existing && JSON.stringify(serializeItemDef(existing)) !== JSON.stringify(serializeItemDef(def))) {
      throw new Error(`Item definition "${name}" already registered with a different definition`);
    }
    this.itemDefinitions.set(name, def);
    return new ModelRef(`${this.name}:${name}`, legacyModelData);
  }

  /** Registered item definitions (name → definition), for resource-pack codegen. */
  get itemDefinitionDefs(): ReadonlyMap<string, ItemDefinition> {
    return this.itemDefinitions;
  }

  /** Registers a block {@link Model} and returns a ref for {@link BlockState} variants. */
  blockModel(name: string, def: Model): ModelRef {
    this.registerDef(this.blockModels, "Block model", name, def);
    return new ModelRef(`${this.name}:block/${name}`);
  }

  /** Registered block models (name → definition), for resource-pack codegen. */
  get blockModelDefs(): ReadonlyMap<string, Model> {
    return this.blockModels;
  }

  /**
   * Overrides an existing block's appearance. `block` defaults to the `minecraft:`
   * namespace.
   */
  blockState(block: string, def: BlockState): void {
    const id = normalizeId(block);
    const existing = this.blockStates.get(id);
    if (existing && existing !== def) {
      throw new Error(`Block state "${id}" already registered with a different definition`);
    }
    this.blockStates.set(id, def);
  }

  /** Registered block states (`<ns>:<block>` → definition), for codegen. */
  get blockStateDefs(): ReadonlyMap<string, BlockState> {
    return this.blockStates;
  }

  /**
   * Escape hatch for resource pack files without a builder: writes `json` to
   * `assets/<ns>/<folder>/<name>.json`.
   */
  resourceFile(folder: string, name: string, json: unknown): void {
    this.resourceFiles.set(`${folder}/${name}`, json);
  }

  /** Registered raw resource files (`<folder>/<name>` → JSON), for codegen. */
  get resourceFileDefs(): ReadonlyMap<string, unknown> {
    return this.resourceFiles;
  }

  /**
   * Copies every file under `dir` into the resource pack's `assets/`, keeping subfolders.
   * `dir` should contain `<ns>/…` folders.
   */
  addAssets(dir: string): this {
    this.assetDirs.push(dir);
    return this;
  }

  /** Source directories registered via {@link addAssets}, for codegen. */
  get assetSources(): readonly string[] {
    return this.assetDirs;
  }
}
