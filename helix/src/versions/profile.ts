import { BrigadierNode } from "../core/commandtree/tree";

/**
 * How pack.mcmeta expresses the pack format: a single number (older) or a min/max range
 * (newer).
 */
export type PackFormatSpec =
  | { kind: "scalar"; value: number }
  | { kind: "range"; min: [number, number]; max: [number, number] };

/** Known ids per registry for a version, for validating authored ids. */
export interface RegistrySet {
  items: ReadonlySet<string>;
  blocks: ReadonlySet<string>;
  effects: ReadonlySet<string>;
  particles: ReadonlySet<string>;
  sounds: ReadonlySet<string>;
  entityTypes: ReadonlySet<string>;
  enchantments: ReadonlySet<string>;
}

/** The Brigadier command tree (commands.json root). */
export type CommandTree = BrigadierNode;

export interface VersionProfile {
  /** Human id, e.g. "1.21.4". */
  id: string;
  /** Numeric data version, used for threshold comparisons. */
  dataVersion: number;
  /** The datapack `pack_format` for this version's `pack.mcmeta`. */
  pack: PackFormatSpec;
  /**
   * The resource pack format, separate from {@link pack} (e.g. 1.21.4 is data 61, resource
   * 46).
   * Falls back to the data format on older versions.
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
   * Whether this version uses 1.21's singular folder names (`tags/block`) or the older
   * plural ones.
   */
  singularFolders: boolean;
  registries: RegistrySet;
  commands: CommandTree;
}
