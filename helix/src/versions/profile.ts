import { BrigadierNode } from "../core/commandtree/tree";

/**
 * How a version expresses its pack format in pack.mcmeta.
 * Older versions use a single scalar `pack_format`; newer versions use a
 * min/max range and reject the scalar form.
 */
export type PackFormatSpec =
  | { kind: "scalar"; value: number }
  | { kind: "range"; min: [number, number]; max: [number, number] };

/**
 * The set of resource-location ids a version knows about, per registry.
 * Used by handlers to validate authored ids against the target version.
 */
export interface RegistrySet {
  items: ReadonlySet<string>;
  blocks: ReadonlySet<string>;
  effects: ReadonlySet<string>;
  particles: ReadonlySet<string>;
  sounds: ReadonlySet<string>;
  entityTypes: ReadonlySet<string>;
  enchantments: ReadonlySet<string>;
}

/**
 * The Brigadier command tree (commands.json root). Typed loosely for now via
 * the shared commandtree model; tightened/queried in Phase 6.
 */
export type CommandTree = BrigadierNode;

export interface VersionProfile {
  /** Human id, e.g. "1.21.4". */
  id: string;
  /** Numeric data version, used for threshold comparisons. */
  dataVersion: number;
  /** The datapack `pack_format` for this version's `pack.mcmeta`. */
  pack: PackFormatSpec;
  /**
   * The resource-pack `pack_format` - distinct from {@link pack} (e.g. 1.21.4 is
   * data 61 / resource 46). Used by `writeResourcePack`'s `pack.mcmeta`. Falls
   * back to the data format on versions predating a separate resource format.
   */
  resourcePack: PackFormatSpec;
  paths: {
    /** "function" (1.21+) | "functions" (<1.21) */
    function: string;
    /** "tags/function" (1.21+) | "tags/functions" (<1.21) */
    functionTag: string;
    /** "structure" (1.21+) | "structures" (<1.21) - where `/place template` reads `.nbt` */
    structure: string;
    /** "predicate" (1.21+) | "predicates" (<1.21) - registered predicate JSON files */
    predicate: string;
    /** "advancement" (1.21+) | "advancements" (<1.21) - registered advancement JSON files */
    advancement: string;
    /** "loot_table" (1.21+) | "loot_tables" (<1.21) - registered loot table JSON files */
    lootTable: string;
    /** "recipe" (1.21+) | "recipes" (<1.21) - registered recipe JSON files */
    recipe: string;
    /** "item_modifier" (1.21+) | "item_modifiers" (<1.21) - registered item modifier JSON files */
    itemModifier: string;
    /** "dimension" (both) - custom dimension JSON files */
    dimension: string;
    /** "worldgen" (both) - worldgen registry root (subfolders per registry) */
    worldgen: string;
  };
  /**
   * Whether this version uses the 1.21 singular registry-folder convention
   * (`tags/block`, `function`, …) vs the pre-1.21 plural one (`tags/blocks`,
   * `functions`, …). Drives registry-tag folder names where the registry id
   * itself pluralizes; the fixed folders above are pre-resolved in `paths`.
   */
  singularFolders: boolean;
  registries: RegistrySet;
  commands: CommandTree;
}
