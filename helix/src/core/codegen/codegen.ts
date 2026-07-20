import { Datapack, serializeItemDef, splitDefName } from "../ir/datapack";
import { ASTNode } from "../ir/node";
import {
  CommandHandler,
  Dispatcher,
} from "../ir/commandhandler";
import { createCommandHandlers } from "../commands";
import { generateFunction, generateSingleNode } from "../ir/generate";
import { PackFormatSpec } from "../../versions/profile";

// 24w44a (1.21.4): the `assets/<ns>/items/` item-definition system + `item_model`
// component. Only emit item definitions at/after this; older packs used
// `models/item/<base>.json` overrides instead.
const ITEM_DEFINITION_DATA_VERSION = 4174;

// Re-exported from their leaf home so existing importers keep working.
export { generateFunction, generateSingleNode };

export function buildDatapack(dp: Datapack): Map<string, string> {
  const files = new Map<string, string>();
  const dispatcher = new Dispatcher(createHandlerMap());

  // Emit any deferred authoring (e.g. animated displays) before codegen.
  dp.runFinalizers();

  // Generate all function files
  for (const fn of dp.functions.values()) {
    generateFunction(fn, dp, dispatcher);
  }

  for (const [name, content] of dp.files) {
    files.set(
      `data/${dp.name}/${dp.version.paths.function}/${name}.mcfunction`,
      content,
    );
  }

  // Generate minecraft tag files (load, tick etc.)
  for (const [tag, fnNames] of dp.tags) {
    const tagContent = {
      values: Array.from(fnNames).map((name) => `${dp.name}:${name}`),
    };
    files.set(
      `data/minecraft/${dp.version.paths.functionTag}/${tag}.json`,
      JSON.stringify(tagContent, null, 2),
    );
  }

  // Emit registered predicate JSON files (version-aware folder + values).
  for (const [name, predicate] of dp.predicateDefs) {
    files.set(
      `data/${dp.name}/${dp.version.paths.predicate}/${name}.json`,
      JSON.stringify(predicate.toJson(dp.version), null, 2),
    );
  }

  // Emit registered advancement JSON files (version-aware folder + values).
  for (const [name, advancement] of dp.advancementDefs) {
    files.set(
      `data/${dp.name}/${dp.version.paths.advancement}/${name}.json`,
      JSON.stringify(advancement.toJson(dp.version), null, 2),
    );
  }

  // Emit registered loot tables, item modifiers and recipes (version-aware folders).
  for (const [name, table] of dp.lootTableDefs) {
    files.set(
      `data/${dp.name}/${dp.version.paths.lootTable}/${name}.json`,
      JSON.stringify(table.toJson(dp.version), null, 2),
    );
  }
  for (const [name, modifier] of dp.itemModifierDefs) {
    files.set(
      `data/${dp.name}/${dp.version.paths.itemModifier}/${name}.json`,
      JSON.stringify(modifier.toJson(dp.version), null, 2),
    );
  }
  for (const [name, recipe] of dp.recipeDefs) {
    files.set(
      `data/${dp.name}/${dp.version.paths.recipe}/${name}.json`,
      JSON.stringify(recipe.toJson(dp.version), null, 2),
    );
  }

  // Emit registered biomes. `worldgen/biome` never pluralized, so the folder is
  // fixed; the *namespace* is not - a namespaced name overrides another pack's
  // (usually vanilla's) biome.
  for (const [name, biome] of dp.biomeDefs) {
    const { namespace, path } = splitDefName(dp, name);
    files.set(
      `data/${namespace}/${dp.version.paths.worldgen}/biome/${path}.json`,
      JSON.stringify(biome.toJson(dp.version), null, 2),
    );
  }

  // Emit registry tags (block/item/fluid/…). The registry id pluralizes on
  // pre-1.21 (`tags/blocks`) and is singular on 1.21+ (`tags/block`). The map key
  // is `<registry>/<name>`; the name (after the first `/`) may itself be nested.
  for (const [key, tag] of dp.registryTagDefs) {
    const folder = dp.version.singularFolders ? tag.registry : `${tag.registry}s`;
    const name = key.slice(tag.registry.length + 1);
    files.set(
      `data/${dp.name}/tags/${folder}/${name}.json`,
      JSON.stringify({ replace: tag.replace, values: tag.values }, null, 2),
    );
  }

  // Emit raw registry files (dimensions, worldgen, damage types, …) verbatim.
  for (const [relPath, json] of dp.registryFileDefs) {
    files.set(
      `data/${dp.name}/${relPath}.json`,
      JSON.stringify(json, null, 2),
    );
  }

  return files;
}

/**
 * Build the resource pack's generated files (`assets/` tree): each registered
 * {@link Model} as `models/item/<name>.json`, its item definition (1.21.4+) as
 * `items/<name>.json`, and any raw `resourceFile` JSON. Verbatim `addAssets`
 * files are copied separately by {@link copyAssets}.
 */
export function buildResourcePack(dp: Datapack): Map<string, string> {
  const files = new Map<string, string>();
  const emitItemDefs = dp.version.dataVersion >= ITEM_DEFINITION_DATA_VERSION;

  for (const [name, model] of dp.modelDefs) {
    files.set(
      `assets/${dp.name}/models/item/${name}.json`,
      JSON.stringify(model.toJson(), null, 2),
    );
  }

  // Item definitions (`assets/<ns>/items/<name>.json`): the full typed item-model
  // union. `dp.model` registers the flat single-model case here; `dp.itemDefinition`
  // the branching ones. The `item_model` component on a stack points at these.
  if (emitItemDefs) {
    for (const [name, def] of dp.itemDefinitionDefs) {
      files.set(
        `assets/${dp.name}/items/${name}.json`,
        JSON.stringify(serializeItemDef(def), null, 2),
      );
    }
  }

  // Block models (`models/block/<name>.json`); referenced by blockstate variants.
  for (const [name, model] of dp.blockModelDefs) {
    files.set(
      `assets/${dp.name}/models/block/${name}.json`,
      JSON.stringify(model.toJson(), null, 2),
    );
  }

  // Blockstate overrides. Keyed by the full block id (`minecraft:note_block`),
  // so the file lands under THAT block's namespace, not necessarily this pack's.
  for (const [id, state] of dp.blockStateDefs) {
    const sep = id.indexOf(":");
    const ns = id.slice(0, sep);
    const blockPath = id.slice(sep + 1);
    files.set(
      `assets/${ns}/blockstates/${blockPath}.json`,
      JSON.stringify(state.toJson(), null, 2),
    );
  }

  // Raw resource files (sounds.json, fonts, atlases, …) verbatim.
  for (const [relPath, json] of dp.resourceFileDefs) {
    files.set(`assets/${dp.name}/${relPath}.json`, JSON.stringify(json, null, 2));
  }

  return files;
}

// Newer versions reject the scalar `pack_format` and require a min/max range.
// `spec` selects which format (datapack by default, resource pack for the RP).
export function buildPackMcmeta(
  dp: Datapack,
  spec: PackFormatSpec = dp.version.pack,
): { pack: Record<string, unknown> } {
  if (spec.kind === "scalar") {
    return { pack: { pack_format: spec.value, description: dp.name } };
  }
  return {
    pack: { description: dp.name, min_format: spec.min, max_format: spec.max },
  };
}

export function createHandlerMap(): Map<ASTNode["type"], CommandHandler> {
  return new Map(createCommandHandlers().map((h) => [h.type, h]));
}
