import { buildDatapack } from "../codegen/codegen";
import {
  analyzeCost,
  CostReport,
  formatCostReport,
} from "../report/cost-report";
import type { ClearFill } from "../codegen/structure";
import { Objective, ObjectiveKind } from "../frontend";
import { FunctionNode } from "./node";
import { scoreInitNode } from "../commands/scoreboard";
import { FunctionRef } from "../function_ref";
import { VersionProfile } from "../../versions/profile";
import type { FunctionContext } from "../frontend/context";
import { TICKS_PER_SECOND, ScoreboardTiming } from "../timing/scoreboard-timing";
import { privateName } from "../private-fn";
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
import { DEFAULT_TARGET, RuntimeTarget } from "./target";

/** A registry tag's registered body: its members and whether it replaces inherited ones. */
export interface RegistryTag {
  /** The registry this tag belongs to (`block`, `item`, `fluid`, `entity_type`, ...). */
  registry: string;
  /** Member ids / `#tag` references. */
  values: string[];
  /** `replace: true` to discard members contributed by lower-priority packs. */
  replace: boolean;
}

export type FunctionTag = "load" | "tick";

/**
 * Split a registered definition's name into the namespace its file lands in and
 * the path within that namespace. A bare name belongs to the pack; a namespaced
 * one (`"minecraft:plains"`) writes into that namespace instead, which is how a
 * pack overrides a vanilla resource. Used by {@link Datapack.biome} and the
 * codegen loop that emits it.
 */
export function splitDefName(dp: Datapack, name: string): { namespace: string; path: string } {
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

export class Datapack {
  name: string;
  readonly version: VersionProfile;
  /**
   * The runtime this build targets (see {@link RuntimeTarget}). Read at codegen
   * via `ctx.target`; only `ctx.native(...)` ops branch on it. Set per build so
   * the same source compiles to a portable `"vanilla"` pack and a `"paper"`
   * server pack. Swap via {@link useTarget}.
   */
  target: RuntimeTarget;
  functions: Map<string, FunctionNode> = new Map();
  private objectives = new Map<string, Objective>();
  private predicates = new Map<string, Predicate>();
  private advancements = new Map<string, AdvancementDef>();
  private lootTables = new Map<string, LootTableDef>();
  private itemModifiers = new Map<string, ItemModifier>();
  private recipes = new Map<string, RecipeDef>();
  // Biome definitions. Keyed by the name AS AUTHORED, which may carry a
  // namespace (`minecraft:plains` to override a vanilla biome) - see splitDefName.
  private biomes = new Map<string, BiomeDef>();
  // Registry (block/item/fluid/…) tags, keyed `<registry>/<name>`; distinct from
  // the function `tags` map above (load/tick), which codegen emits separately.
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
  public files = new Map<string, string>();
  public tags = new Map<FunctionTag, Set<string>>();

  /** How run-for-a-duration / periodic timing compiles. */
  readonly timing = new ScoreboardTiming();
  private finalizers: (() => void)[] = [];
  private finalizersRun = false;
  private structureDirs: string[] = [];
  // `_clear` structure variants a clip explicitly requested (see `Clip.clearWith`),
  // keyed by the source structure's path within this namespace (no `<ns>:` prefix,
  // no `.nbt`) - codegen derives only these, each filled with the chosen block.
  private clearVariants = new Map<string, ClearFill>();

  constructor(
    name: string,
    version: VersionProfile,
    target: RuntimeTarget = DEFAULT_TARGET,
  ) {
    this.name = name.toLowerCase();
    this.version = version;
    this.target = target;
  }

  /**
   * Write this pack to `outputPath` (functions, tags, data resources, structures,
   * `pack.mcmeta`). The disk-writing code lives in `codegen/write.ts` and is
   * loaded lazily via dynamic `import()`, so merely importing helix (or building a
   * pack in-memory with {@link buildDatapack}) never pulls in Node's `fs`/`path` -
   * that's what lets the compiler run in a browser. Consequently this is async;
   * `await` it if you need the files on disk before continuing.
   */
  async writeDatapack(outputPath: string, opts?: { zip?: boolean }) {
    this.prepareForCodegen();
    const { writeDatapack } = await import("../codegen/write.js");
    writeDatapack(this, outputPath, opts); //call back codegen
  }

  /**
   * Settle deferred authoring and inject load initializers, the shared prelude
   * to any codegen. Idempotent - `runFinalizers` and the init injection both
   * no-op on repeat - so {@link report} and {@link writeDatapack} can both call it.
   */
  private prepareForCodegen() {
    this.runFinalizers();
    this.ensureLoadInitializers();
  }

  /**
   * Static per-tick cost analysis: walks the call graph rooted at the `tick` tag
   * to report worst-case commands/tick and flag functions doing unbounded `@e`
   * scans. Runs codegen first (into `dp.files`), so call it once authoring is
   * done. Pure analysis - emits nothing and does not write to disk. Pass through
   * {@link formatCostReport} (or {@link printReport}) for a readable summary.
   */
  report(): CostReport {
    this.prepareForCodegen();
    buildDatapack(this); // populate dp.files; idempotent (cached per function)
    return analyzeCost(this);
  }

  /** Convenience: run {@link report} and print the formatted summary. */
  printReport(): CostReport {
    const report = this.report();
    console.log(formatCostReport(report));
    return report;
  }

  /**
   * Ship every `.nbt` under `dir` (recursively) into this pack's structure
   * folder - `data/<ns>/<structure|structures>/<relative path>.nbt`, picking the
   * folder name from the target version. A file `cog.nbt` becomes the template
   * id `<ns>:cog`, loadable with `/place template` (see {@link Clip.swaps}).
   * Copied verbatim at {@link writeDatapack} time (binary, not generated).
   */
  addStructures(dir: string): this {
    this.structureDirs.push(dir);
    return this;
  }

  /** Source directories registered via {@link addStructures}, for codegen. */
  get structureSources(): readonly string[] {
    return this.structureDirs;
  }

  /**
   * Register a derived `_clear` variant of a shipped structure (see
   * {@link Clip.clearWith}): `structureId` is the structure's `/place template`
   * id (`<ns>:path` or bare `path`); `fill` is the block its solid cells become.
   * codegen emits `<path>_clear.nbt` with that single-block palette and the air
   * cells dropped. Requesting the same structure with a conflicting fill throws.
   */
  requestClearVariant(structureId: string, fill: ClearFill): void {
    const key = structureId.includes(":")
      ? structureId.slice(structureId.indexOf(":") + 1)
      : structureId;
    const existing = this.clearVariants.get(key);
    if (existing && existing.Name !== fill.Name) {
      throw new Error(
        `Structure "${key}" already has a _clear fill of ${existing.Name}; ` +
          `cannot also clear it with ${fill.Name}.`,
      );
    }
    this.clearVariants.set(key, fill);
  }

  /** Requested `_clear` variants (path → fill block), for codegen. */
  get clearStructureVariants(): ReadonlyMap<string, ClearFill> {
    return this.clearVariants;
  }

  /** Set the runtime this build targets (default: `"vanilla"`). See {@link RuntimeTarget}. */
  useTarget(target: RuntimeTarget): this {
    this.target = target;
    return this;
  }

  /**
   * Register work to run once at datapack finalisation (before codegen), after
   * all authoring is done - used by deferred emitters like {@link AnimatedDisplay}
   * so chained config (e.g. `.forSeconds(...)`) is settled before they emit.
   */
  onFinalize(fn: () => void) {
    this.finalizers.push(fn);
  }

  /** Run all registered finalizers exactly once (idempotent). */
  runFinalizers() {
    if (this.finalizersRun) return;
    this.finalizersRun = true;
    for (const fn of this.finalizers) fn();
  }

  /**
   * A hook function that runs every `seconds` seconds (scoreboard clock).
   * `phase` (in ticks) staggers it within the period - see {@link everyTicks}.
   */
  everySeconds(seconds: number, phase = 0): FunctionRef {
    return this.timing.everyTicks(
      this,
      Math.round(seconds * TICKS_PER_SECOND),
      `${seconds}s`,
      phase,
    );
  }

  /**
   * A hook function that runs every `ticks` ticks (scoreboard clock). `phase`
   * offsets it within the period so several same-period hooks fire on different
   * ticks, spreading per-tick load instead of bunching it.
   */
  everyTicks(ticks: number, phase = 0): FunctionRef {
    return this.timing.everyTicks(this, ticks, `${ticks}t`, phase);
  }

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
   * once without ordering hazards), mirroring {@link Datapack.predicate}.
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
   * Register a definition under `name`, deduplicating by reference so the same
   * module imported by several parents declares once without ordering hazards;
   * re-registering `name` with a *different* object throws. Shared by the
   * predicate / advancement / loot-table / item-modifier / recipe registries.
   */
  private registerDef<T>(map: Map<string, T>, kind: string, name: string, def: T): void {
    const existing = map.get(name);
    if (existing && existing !== def) {
      throw new Error(`${kind} "${name}" already registered with a different definition`);
    }
    map.set(name, def);
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
   * copied at {@link writeResourcePack} time. `dir` should contain a `<ns>/…`
   * (or `minecraft/…`) layout as it will sit directly under `assets/`.
   */
  addAssets(dir: string): this {
    this.assetDirs.push(dir);
    return this;
  }

  /** Source directories registered via {@link addAssets}, for codegen. */
  get assetSources(): readonly string[] {
    return this.assetDirs;
  }

  /**
   * Write this pack's resource pack (`assets/` + a resource-format `pack.mcmeta`)
   * to `outputPath` - a *separate* pack from {@link writeDatapack} (own folder,
   * own format). Emits generated models + item definitions + `resourceFile` JSON
   * and copies `addAssets` dirs verbatim. Async for the same reason as
   * {@link writeDatapack}: the disk path is dynamic-imported so the compiler
   * stays browser-safe.
   */
  async writeResourcePack(outputPath: string) {
    this.prepareForCodegen();
    const { writeResourcePack } = await import("../codegen/write.js");
    writeResourcePack(this, outputPath);
  }

  objective(name: string, kind: ObjectiveKind = "dummy") {
    const existing = this.objectives.get(name);

    if (existing) {
      if (existing.kind !== kind) {
        throw new Error(
          `Objective "${name}" already declared as ${existing.kind}`,
        );
      }
      return existing;
    }

    const obj = new Objective(name, kind);
    this.objectives.set(name, obj);
    return obj;
  }
  createFunction(name: string, ...tags: FunctionTag[]): FunctionRef {
    const fn = new FunctionNode(name);
    this.functions.set(name, fn);
    this.tagFunction(name, tags);
    return new FunctionRef(fn, this.version);
  }

  /**
   * Like {@link createFunction}, but reuses an existing function node when one
   * already exists under `name` (so multiple authors can append to it - e.g.
   * several animated displays adding their setup to the shared `load`).
   */
  getOrCreateFunction(name: string, ...tags: FunctionTag[]): FunctionRef {
    let fn = this.functions.get(name);
    if (!fn) {
      fn = new FunctionNode(name);
      this.functions.set(name, fn);
    }
    this.tagFunction(name, tags);
    return new FunctionRef(fn, this.version);
  }

  /** A ref to an already-created function, or `undefined` if none exists. */
  functionRef(name: string): FunctionRef | undefined {
    const fn = this.functions.get(name);
    return fn ? new FunctionRef(fn, this.version) : undefined;
  }

  /**
   * Remove `name` from a function tag (`load`/`tick`) without deleting the
   * function itself. Mechanism only: lets a higher layer reparent a self-tagged
   * function (e.g. route every `tick` member through one owned dispatcher) - it
   * states no policy about whether you should.
   */
  untag(name: string, tag: FunctionTag): void {
    this.tags.get(tag)?.delete(name);
  }

  private tagFunction(name: string, tags: FunctionTag[]) {
    const autoTags = new Set<FunctionTag>([...tags]);
    if (name === "tick") autoTags.add("tick");
    if (name === "load") autoTags.add("load");

    for (const tag of autoTags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(name);
    }
  }

  // `dp.clip()` / `dp.slide()` / `dp.effect()` are installed by the `spool`
  // package (it augments this prototype) - the animation mechanics are composed
  // conveniences over the public API, not part of the IR core. `import "spool"`
  // to use them. They share the `timing` strategy below.

  /** Append to the `load` function (runs on pack load / `/reload`). */
  load(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("load", "load");
    ref.build(builder);
    return ref;
  }

  /** Append to the `tick` function (runs every game tick). */
  tick(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("tick", "tick");
    ref.build(builder);
    return ref;
  }

  private ensureLoadInitializers() {
    // Ensure load function exists
    let loadFn = this.functions.get("load");

    if (!loadFn) {
      loadFn = new FunctionNode("load");
      this.functions.set("load", loadFn);

      // tag it properly
      if (!this.tags.has("load")) {
        this.tags.set("load", new Set());
      }
      this.tags.get("load")!.add("load");
    }

    // Ensure objective init function exists
    const initName = privateName("init_objectives");

    let initFn = this.functions.get(initName);
    if (!initFn) {
      initFn = new FunctionNode(initName);
      this.functions.set(initName, initFn);
    }

    // Rebuild the objective-creation body from the *current* objective set on
    // every call. prepareForCodegen is idempotent, but objectives may have been
    // registered between calls (e.g. `dp.report()`, then more authoring, then
    // `writeDatapack()`); freezing the body at first codegen would silently drop
    // those late objectives from init. Clearing in place is cheap.
    initFn.nodes.length = 0;
    for (const obj of this.objectives.values()) {
      initFn.nodes.push(scoreInitNode(obj));
    }

    // Inject call at start of load function
    const alreadyInjected = loadFn.nodes.some(
      (n) => n instanceof FunctionNode && n.name === initName,
    );

    if (!alreadyInjected) {
      loadFn.nodes.unshift(new FunctionNode(initName));
    }
  }
}
