// The middle third of `Datapack`: every resource registry - the data side
// (predicates, advancements, loot tables, item modifiers, recipes, biomes,
// registry tags, raw registry files) and the resource-pack side (models, item
// definitions, block models, block states, raw asset files). Each registrar
// records a definition and hands back a typed ref; codegen reads them via the
// `*Defs` getters. See datapack-core.ts for the split.
import type { FunctionContext } from "../frontend/context";
import { FunctionRef } from "../function_ref";
import { Predicate, PredicateRef } from "../values/predicate";
import { AdvancementDef, Trigger } from "../values/advancement";
import { Selector } from "../frontend/nodes/selector";
import { Advancement, Biome, FunctionId } from "../values/resource.generated";
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
 * Split a registered definition's name into the namespace its file lands in and
 * the path within that namespace. A bare name belongs to the pack; a namespaced
 * one (`"minecraft:plains"`) writes into that namespace instead, which is how a
 * pack overrides a vanilla resource. Used by {@link DatapackResources.biome} and
 * the codegen loop that emits it.
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
  // Biome definitions. Keyed by the name AS AUTHORED, which may carry a
  // namespace (`minecraft:plains` to override a vanilla biome) - see splitDefName.
  private biomes = new Map<string, BiomeDef>();
  // Registry (block/item/fluid/…) tags, keyed `<registry>/<name>`; distinct from
  // the function `tags` map on the core, which codegen emits separately.
  private registryTags = new Map<string, RegistryTag>();
  // Raw JSON registry files for types without a typed builder yet (dimensions,
  // worldgen, damage types, …), keyed by relative `<folder>/<name>` under the ns.
  private registryFiles = new Map<string, unknown>();
  // Resource-pack outputs (see writeResourcePack). Generated models keyed by
  // name; raw asset JSON keyed `<folder>/<name>`; verbatim-copy asset dirs.
  private models = new Map<string, Model>();
  // Item definitions (`assets/<ns>/items/<name>.json`) keyed by name. `dp.model`
  // registers the flat one here; `dp.itemDefinition` the full typed union.
  private itemDefinitions = new Map<string, ItemDefinition>();
  // Block models keyed by name (under this ns); block states keyed by the full
  // normalized block id they override (usually `minecraft:<block>`).
  private blockModels = new Map<string, Model>();
  private blockStates = new Map<string, BlockState>();
  private resourceFiles = new Map<string, unknown>();
  private assetDirs: string[] = [];

  /**
   * Register a {@link Predicate} as `data/<ns>/<predicate folder>/<name>.json`
   * and return a {@link PredicateRef} (`<ns>:name`) to reference it from
   * `Selector.predicate(...)` (`@e[predicate=...]`) or `predicateCheck(...)`
   * (`if predicate ...`). Re-registering the same name throws unless the
   * predicate object is identical by reference (so shared modules can declare
   * once without ordering hazards).
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
   * Register an {@link AdvancementDef} as `data/<ns>/<advancement folder>/<name>.json`
   * and return an {@link Advancement} id (`<ns>:name`) to reference it (e.g. from
   * `ctx.advancement().revokeOnly(...)`). Re-registering the same name throws
   * unless the definition is identical by reference (so shared modules can declare
   * once without ordering hazards), mirroring {@link predicate}.
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
   * A **repeatable event handler**: `body` runs, as the triggering player, every
   * time `trigger` fires.
   *
   * Vanilla has no event hook, so the idiom is an advancement whose reward
   * function re-arms it - and the re-arm is the part that gets forgotten, leaving
   * a handler that silently fires exactly once per player, forever. This emits
   * both halves under `name` and appends the
   * `advancement revoke @s only <this>` tail itself, so the pair can't drift:
   *
   *   dp.event("exit/eat_chorus", Trigger.consumeItem(Item.CHORUS_FRUIT),
   *     (ctx) => { ... });
   *
   * Note this is genuinely *event*-shaped work. A condition you could just as
   * well test on a tick (a player standing in a box, a block having a given
   * state) belongs in a {@link Predicate} checked from a tick function, not here.
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

  /**
   * Register a {@link LootTableDef} as `data/<ns>/<loot_table folder>/<name>.json` and
   * return a {@link LootTableRef} (`<ns>:name`) to reference it from `/loot ... loot`,
   * a container `set_loot`, or a nested loot entry.
   */
  lootTable(name: string, table: LootTableDef): LootTableRef {
    this.registerDef(this.lootTables, "Loot table", name, table);
    return new LootTableRef(`${this.name}:${name}`);
  }

  /** Registered loot tables (name → definition), for codegen. */
  get lootTableDefs(): ReadonlyMap<string, LootTableDef> {
    return this.lootTables;
  }

  /**
   * Register an {@link ItemModifier} as `data/<ns>/<item_modifier folder>/<name>.json`
   * and return an {@link ItemModifierRef} (`<ns>:name`) for `/item modify ... <ref>`.
   */
  itemModifier(name: string, modifier: ItemModifier): ItemModifierRef {
    this.registerDef(this.itemModifiers, "Item modifier", name, modifier);
    return new ItemModifierRef(`${this.name}:${name}`);
  }

  /** Registered item modifiers (name → definition), for codegen. */
  get itemModifierDefs(): ReadonlyMap<string, ItemModifier> {
    return this.itemModifiers;
  }

  /**
   * Register a {@link RecipeDef} as `data/<ns>/<recipe folder>/<name>.json` and return a
   * {@link RecipeRef} (`<ns>:name`) for `/recipe give|take`.
   */
  recipe(name: string, recipe: RecipeDef): RecipeRef {
    this.registerDef(this.recipes, "Recipe", name, recipe);
    return new RecipeRef(`${this.name}:${name}`);
  }

  /** Registered recipes (name → definition), for codegen. */
  get recipeDefs(): ReadonlyMap<string, RecipeDef> {
    return this.recipes;
  }

  /**
   * Register a {@link BiomeDef} as `data/<ns>/worldgen/biome/<name>.json` and
   * return the {@link Biome} id to reference it from `/fillbiome`, a dimension's
   * biome source, or another pack.
   *
   * Unlike the other registries this one is **namespace-aware**: pass a
   * namespaced `name` to write outside this pack's namespace, which is how a
   * datapack replaces a vanilla biome (the only way a biome takes effect in the
   * overworld without a custom dimension):
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
   * Register a **registry tag** (`block`, `item`, `fluid`, `entity_type`, ...) as
   * `data/<ns>/tags/<registry>/<name>.json`. Distinct from the function tags
   * (`load`/`tick`). Re-registering the same `<registry>/<name>` appends `values`
   * (so several modules can extend one tag); pass `replace: true` to drop members
   * contributed by lower-priority packs. Values are member ids or `#tag` refs.
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
   * Declare a **function tag** in this pack's namespace and return a typed
   * reference to it, for `ctx.callTag(...)` / `schedule`.
   *
   * This is the `load`/`tick` mechanism generalised: those two are vanilla's own
   * tags and get auto-membership from {@link createFunction}, while these are
   * pack-defined fan-out hooks whose members you list. Members are given as
   * {@link FunctionRef}s, so a tag can't name a function that doesn't exist.
   * Calling again with the same `name` appends members.
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
   * The namespaced id of a function in this pack (`<ns>:<name>`), as the typed
   * {@link FunctionId} that `schedule` and friends take - so a call site never
   * hand-writes the id of a function it already holds a reference to.
   */
  idOf(ref: FunctionRef): FunctionId {
    return FunctionId(`${this.name}:${ref.getName()}`);
  }

  /**
   * Escape hatch for data types without a typed builder yet (custom dimensions,
   * worldgen, damage types, enchantments, chat types, dialogs, ...): write `json`
   * verbatim to `data/<ns>/<folder>/<name>.json`. `folder` is the registry path
   * (e.g. `"dimension"`, `"worldgen/configured_feature"`, `"damage_type"`).
   */
  registryFile(folder: string, name: string, json: unknown): void {
    this.registryFiles.set(`${folder}/${name}`, json);
  }

  /** Registered raw registry files (`<folder>/<name>` → JSON), for codegen. */
  get registryFileDefs(): ReadonlyMap<string, unknown> {
    return this.registryFiles;
  }

  // --- Resource pack (assets/) --------------------------------------------
  // Emitted by writeResourcePack, NOT writeDatapack - a resource pack is a
  // separate Minecraft pack with its own pack.mcmeta and output folder.

  /**
   * Register a {@link Model} as `assets/<ns>/models/item/<name>.json` and (on
   * 1.21.4+) its item definition `assets/<ns>/items/<name>.json`, returning a
   * {@link ModelRef} (`<ns>:name`) to attach with `Item.X.model(ref)`. Pass
   * `legacyModelData` to also work on versions predating the `item_model`
   * component (they reference the model by that `custom_model_data` number).
   * Re-registering the same name with a different {@link Model} throws.
   */
  model(name: string, def: Model, legacyModelData?: number): ModelRef {
    this.registerDef(this.models, "Model", name, def);
    // The item definition is the flat single-model case of the full union; register
    // it through the same path a rich `itemDefinition` uses so codegen has one source.
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
   * Register a full typed {@link ItemModel} as the item definition
   * `assets/<ns>/items/<name>.json` (1.21.4+), returning a {@link ModelRef}
   * (`<ns>:name`) to attach with `Item.X.model(ref)`. This is the rich sibling of
   * {@link model}: use it for the branching item-model arms (`condition`, `select`,
   * `range_dispatch`, `composite`, `special`) and `tints`; `model` is the flat case.
   * The `ItemModel`'s model references must point at models emitted by
   * {@link model}/{@link blockModel} or shipped via {@link addAssets}. Pass
   * `legacyModelData` to also work on versions predating the `item_model` component.
   * Re-registering the same name with a different definition throws.
   */
  itemDefinition(
    name: string,
    model: ItemModel,
    options?: ItemDefinition["options"],
    legacyModelData?: number,
  ): ModelRef {
    const def: ItemDefinition = { model, options };
    const existing = this.itemDefinitions.get(name);
    // Guard by rendered value (not reference): `model()` builds a fresh wrapper each
    // call, so an idempotent re-register of the same content must still be allowed.
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

  /**
   * Register a block {@link Model} as `assets/<ns>/models/block/<name>.json` and
   * return a {@link ModelRef} (`<ns>:block/<name>`) to reference from a
   * {@link BlockState} variant. No item definition (blocks aren't items).
   * Re-registering the same name with a different model throws.
   */
  blockModel(name: string, def: Model): ModelRef {
    this.registerDef(this.blockModels, "Block model", name, def);
    return new ModelRef(`${this.name}:block/${name}`);
  }

  /** Registered block models (name → definition), for resource-pack codegen. */
  get blockModelDefs(): ReadonlyMap<string, Model> {
    return this.blockModels;
  }

  /**
   * Register a {@link BlockState} overriding the appearance of an existing block
   * (`block` is a block id - namespace defaults to `minecraft:`, since blockstate
   * files target real block ids), emitted as `assets/<ns>/blockstates/<path>.json`.
   * Re-registering the same block with a different definition throws.
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
   * Escape hatch for resource-pack files without a typed builder yet (sounds.json,
   * fonts, blockstates, atlases, …): write `json` verbatim to
   * `assets/<ns>/<folder>/<name>.json`. Mirrors {@link registryFile} on the data side.
   */
  resourceFile(folder: string, name: string, json: unknown): void {
    this.resourceFiles.set(`${folder}/${name}`, json);
  }

  /** Registered raw resource files (`<folder>/<name>` → JSON), for codegen. */
  get resourceFileDefs(): ReadonlyMap<string, unknown> {
    return this.resourceFiles;
  }

  /**
   * Ship every file under `dir` (recursively) verbatim into the resource pack's
   * `assets/` tree, preserving subfolders - for pre-made models, textures, and
   * assets from an existing pack (e.g. custom blocks). Mirrors {@link addStructures};
   * copied at {@link Datapack.writeResourcePack} time. `dir` should contain a
   * `<ns>/…` (or `minecraft/…`) layout as it will sit directly under `assets/`.
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
