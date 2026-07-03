import {
  CommandTree,
  PackFormatSpec,
  RegistrySet,
  VersionProfile,
} from "./profile";

// Pure profile construction: turn already-parsed raw mcmeta JSON into a
// VersionProfile. NO disk access lives here (that's load.ts), so this module is
// browser-safe - the playground builds profiles from JSON it fetched at runtime.

// 1.21 (data version 3953) renamed the function/tag folders to singular.
const SINGULAR_FOLDERS_SINCE = 3953;
// pack.mcmeta switched to a required min/max range at this pack format.
const RANGE_PACK_FORMAT_SINCE = 80;

// RegistrySet field -> mcmeta registry key.
const REGISTRY_MAP: Record<keyof RegistrySet, string> = {
  items: "item",
  blocks: "block",
  effects: "mob_effect",
  particles: "particle_type",
  sounds: "sound_event",
  entityTypes: "entity_type",
  enchantments: "enchantment",
};

/** The raw mcmeta-derived data persisted alongside each version, as JSON. */
export interface RawProfile {
  id: string;
  dataVersion: number;
  dataPackVersion: number;
  dataPackVersionMinor?: number;
  /** Resource-pack format (distinct from the datapack one); falls back to the data format. */
  resourcePackVersion?: number;
  resourcePackVersionMinor?: number;
  /** mcmeta registry key -> ids WITHOUT the `minecraft:` namespace. */
  registries: Record<string, string[]>;
  commands: CommandTree;
}

/** A `pack_format` (major/minor) as the scalar/range shape the mcmeta version dictates. */
function formatSpec(major: number, minor: number): PackFormatSpec {
  if (major >= RANGE_PACK_FORMAT_SINCE) {
    return { kind: "range", min: [major, minor], max: [major, minor] };
  }
  return { kind: "scalar", value: major };
}

function packSpec(raw: RawProfile): PackFormatSpec {
  return formatSpec(raw.dataPackVersion, raw.dataPackVersionMinor ?? 0);
}

/** The resource-pack format spec; falls back to the data format for versions predating it. */
function resourcePackSpec(raw: RawProfile): PackFormatSpec {
  return formatSpec(
    raw.resourcePackVersion ?? raw.dataPackVersion,
    raw.resourcePackVersionMinor ?? 0,
  );
}

function registrySet(raw: RawProfile): RegistrySet {
  const build = (key: string): ReadonlySet<string> =>
    new Set((raw.registries[key] ?? []).map((id) => `minecraft:${id}`));

  return {
    items: build(REGISTRY_MAP.items),
    blocks: build(REGISTRY_MAP.blocks),
    effects: build(REGISTRY_MAP.effects),
    particles: build(REGISTRY_MAP.particles),
    sounds: build(REGISTRY_MAP.sounds),
    entityTypes: build(REGISTRY_MAP.entityTypes),
    enchantments: build(REGISTRY_MAP.enchantments),
  };
}

/**
 * Build a {@link VersionProfile} from already-parsed raw mcmeta JSON. Pure - no
 * disk access - so it works in any environment (this is what the browser build
 * calls with JSON it fetched at runtime). `loadProfile` (load.ts) is the Node
 * wrapper that reads the bundled `data/<file>` first.
 */
export function profileFromRaw(raw: RawProfile): VersionProfile {
  const singularFolders = raw.dataVersion >= SINGULAR_FOLDERS_SINCE;

  return {
    id: raw.id,
    dataVersion: raw.dataVersion,
    pack: packSpec(raw),
    resourcePack: resourcePackSpec(raw),
    paths: singularFolders
      ? {
          function: "function",
          functionTag: "tags/function",
          structure: "structure",
          predicate: "predicate",
          advancement: "advancement",
          lootTable: "loot_table",
          recipe: "recipe",
          itemModifier: "item_modifier",
          dimension: "dimension",
          worldgen: "worldgen",
        }
      : {
          function: "functions",
          functionTag: "tags/functions",
          structure: "structures",
          predicate: "predicates",
          advancement: "advancements",
          lootTable: "loot_tables",
          recipe: "recipes",
          itemModifier: "item_modifiers",
          dimension: "dimension",
          worldgen: "worldgen",
        },
    singularFolders,
    registries: registrySet(raw),
    commands: raw.commands,
  };
}
