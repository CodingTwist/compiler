// `Datapack` layer: resource pack registries (models, item definitions, block states, assets).
// Written by writeResourcePack, not writeDatapack; a resource pack is a separate pack.
import { Model, ModelRef } from "../../values/model";
import { ItemModel } from "../../values/item-model";
import { BlockState } from "../../values/block-state";
import { normalizeId } from "../../../versions/registry";
import { DatapackData } from "./data";

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
    ...(o?.oversizedInGui !== undefined
      ? { oversized_in_gui: o.oversizedInGui }
      : {}),
  };
}

export class DatapackAssets extends DatapackData {
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
    if (
      existing &&
      JSON.stringify(serializeItemDef(existing)) !==
        JSON.stringify(serializeItemDef(def))
    ) {
      throw new Error(
        `Item definition "${name}" already registered with a different definition`,
      );
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
      throw new Error(
        `Block state "${id}" already registered with a different definition`,
      );
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
