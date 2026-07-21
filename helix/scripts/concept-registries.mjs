// Shared between scripts/versions.mjs and scripts/gen-commands.mjs.
//
// These registries get typed `.MEMBER` accessors on their concept value /
// factory (e.g. `Block.GRASS_BLOCK`, `Enchantment.SHARPNESS`). For each one,
// versions.mjs emits an `<X>_IDS` const (the id map) into versions/data/ids.ts,
// and the value layer wraps each id in the concept type:
//   - block / item            -> hand-written block.ts / item.ts
//   - the rest (branded ids)   -> generated resource.generated.ts
// Both generators derive the const name the same way so the imports line up.
//
// Only registries with stable, enumerable vanilla contents belong here.
// Datapack-defined registries (loot tables, recipes, functions, advancements,
// …) are intentionally absent: you author those, so there's nothing to list.
export const CONCEPT_REGISTRIES = [
  "minecraft:block",
  "minecraft:item",
  "minecraft:enchantment",
  "minecraft:entity_type",
  "minecraft:mob_effect",
  "minecraft:particle_type",
  "minecraft:attribute",
  "minecraft:damage_type",
  "minecraft:dimension",
  "minecraft:point_of_interest_type",
  "minecraft:sound_event",
  "minecraft:worldgen/biome",
  "minecraft:worldgen/structure",
];

// Tag registries that get a typed `<X>_TAGS` const namespace, so authors write
// `Block.tag(BLOCK_TAGS.AIR)` instead of the `"#minecraft:air"` string - same
// autocomplete + typo-safety as the id members, for tags. mcmeta already carries
// these under `tag/<registry>` in the registries summary (no extra fetch).
export const CONCEPT_TAG_REGISTRIES = ["tag/block", "tag/item", "tag/entity_type"];

/** "minecraft:entity_type" -> "ENTITY_TYPE_IDS"; "minecraft:worldgen/biome" -> "WORLDGEN_BIOME_IDS". */
export const idsConstName = (registry) =>
  registry.replace(/^minecraft:/, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase() +
  "_IDS";

/** "tag/block" -> "BLOCK_TAGS"; "tag/entity_type" -> "ENTITY_TYPE_TAGS". */
export const tagsConstName = (registry) =>
  registry.replace(/^tag\//, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase() +
  "_TAGS";

/** "minecraft:grass_block" -> "GRASS_BLOCK"; digit-leading ids get a "_" prefix. */
export const memberKey = (id) => {
  const k = id
    .replace(/^minecraft:/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
  return /^[0-9]/.test(k) ? "_" + k : k;
};

/** The registry id for an mcmeta registry key, e.g. "worldgen/biome" -> "minecraft:worldgen/biome". */
export const registryId = (key) => `minecraft:${key}`;
