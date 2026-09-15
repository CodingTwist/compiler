// Builds the resource pack's generated files.
import { Datapack, serializeItemDef } from "../ir/datapack";

// 24w44a (1.21.4) added `assets/<ns>/items/` item definitions. Older packs use
// `models/item/` overrides.
const ITEM_DEFINITION_DATA_VERSION = 4174;

/**
 * Builds the resource pack's generated files: models, item definitions (1.21.4+) and raw
 * JSON.
 * `addAssets` files are copied separately by {@link copyAssets}.
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

  // Item definitions: `dp.model` registers simple ones, `dp.itemDefinition` branching ones.
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

  // Blockstate overrides, written under the block's own namespace.
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
    files.set(
      `assets/${dp.name}/${relPath}.json`,
      JSON.stringify(json, null, 2),
    );
  }

  return files;
}
