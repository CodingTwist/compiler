// Builds the datapack's files: functions, tags and data JSON.
import { Datapack, splitDefName } from "../ir/datapack";
import { ASTNode } from "../ir/node";
import { CommandHandler, Dispatcher } from "../ir/commandhandler";
import { createCommandHandlers } from "../commands";
import { generateFunction, generateSingleNode } from "../ir/generate";
import { inlineSingleCommandFunctions } from "./inline";
import { groupExecutePrefixes } from "./group";

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

  // Emit biomes. A namespaced name overrides another pack's biome (usually vanilla's).
  for (const [name, biome] of dp.biomeDefs) {
    const { namespace, path } = splitDefName(dp, name);
    files.set(
      `data/${namespace}/${dp.version.paths.worldgen}/biome/${path}.json`,
      JSON.stringify(biome.toJson(dp.version), null, 2),
    );
  }

  // Emit registry tags. The folder is plural before 1.21 (`tags/blocks`), singular after.
  // The key is `<registry>/<name>`, and the name may be nested.
  for (const [key, tag] of dp.registryTagDefs) {
    const folder = dp.version.singularFolders
      ? tag.registry
      : `${tag.registry}s`;
    const name = key.slice(tag.registry.length + 1);
    files.set(
      `data/${dp.name}/tags/${folder}/${name}.json`,
      JSON.stringify({ replace: tag.replace, values: tag.values }, null, 2),
    );
  }

  // Emit raw registry files (dimensions, worldgen, damage types, …) verbatim.
  for (const [relPath, json] of dp.registryFileDefs) {
    files.set(`data/${dp.name}/${relPath}.json`, JSON.stringify(json, null, 2));
  }

  // JSON may name functions, so inline once it's all rendered. Function files go first.
  if (dp.optimize.inline !== false)
    inlineSingleCommandFunctions(dp, files.values());
  if (dp.optimize.group !== false) groupExecutePrefixes(dp);
  const out = new Map<string, string>();
  for (const [name, content] of dp.files) {
    out.set(
      `data/${dp.name}/${dp.version.paths.function}/${name}.mcfunction`,
      content,
    );
  }
  for (const [path, content] of files) out.set(path, content);
  return out;
}

export function createHandlerMap(): Map<ASTNode["type"], CommandHandler> {
  return new Map(createCommandHandlers().map((h) => [h.type, h]));
}
