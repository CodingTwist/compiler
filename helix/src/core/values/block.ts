import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";
import { NbtValue } from "./nbt";
import type { VersionProfile } from "../../versions/profile";
import { withMembers } from "./members";
import { BLOCK_IDS } from "../../versions/data/ids";

/** 26.3: block state compounds use `id`/`properties`. ponytail: gated after 26.2; the exact 26.3 snapshot is unchecked. */
export const BLOCK_STATE_ID_DATA_VERSION = 4904;

/** Typed vanilla block tag ids for `Block.tag(...)`, e.g. `BLOCK_TAGS.AIR`. Generated. */
export { BLOCK_TAGS } from "../../versions/data/ids";

/**
 * A block with optional state properties and block-entity data:
 *
 *   Block("stone")                        -> "minecraft:stone"
 *   Block("furnace", { facing: "north" }) -> "minecraft:furnace[facing=north]"
 *   Block("furnace").state({ facing: "north" })
 *                                         -> "minecraft:furnace[facing=north]"
 *   Block("chest").data('{Lock:"key"}')   -> 'minecraft:chest{Lock:"key"}'
 *   Block("#logs")                        -> "#minecraft:logs" (predicate tag)
 */
export type BlockStates = Record<string, string | number | boolean>;

export class BlockValue implements CommandValue {
  private states: BlockStates = {};
  private nbt?: string | NbtValue;

  constructor(
    private readonly id: string,
    states?: BlockStates,
  ) {
    if (states) Object.assign(this.states, states);
  }

  state(props: BlockStates): this {
    Object.assign(this.states, props);
    return this;
  }

  /** Block-entity NBT, as an {@link Nbt} value or a raw SNBT string. */
  data(nbt: string | NbtValue): this {
    this.nbt = nbt;
    return this;
  }

  render(version?: VersionProfile): string {
    let out = normalizeBlockId(this.id);
    const entries = Object.entries(this.states);
    if (entries.length > 0) {
      out += `[${entries.map(([k, v]) => `${k}=${v}`).join(",")}]`;
    }
    if (this.nbt !== undefined) {
      out +=
        typeof this.nbt === "string"
          ? this.nbt
          : this.nbt.render(version as VersionProfile);
    }
    return out;
  }

  /**
   * The compound form for `block_display` and `block_state` fields: `{Name, Properties}`,
   * or `{id, properties}` from 26.3, which rejects the old keys.
   */
  toBlockState(version?: VersionProfile): Record<string, string | Record<string, string>> {
    const [name, props] =
      version && version.dataVersion >= BLOCK_STATE_ID_DATA_VERSION ? ["id", "properties"] : ["Name", "Properties"];
    const entries = Object.entries(this.states);
    const state: Record<string, string | Record<string, string>> = { [name]: normalizeBlockId(this.id) };
    if (entries.length > 0) state[props] = Object.fromEntries(entries.map(([k, v]) => [k, String(v)]));
    return state;
  }
}

/** Block ids may be a tag (`#...`); only namespace plain ids. */
function normalizeBlockId(id: string): string {
  if (id.startsWith("#")) {
    const body = id.slice(1);
    return "#" + normalizeId(body);
  }
  return normalizeId(id);
}

export type Block = BlockValue;

/**
 * A block tag (`#namespace:path`). Prefer `Block.tag(BLOCK_TAGS.AIR)`; the `#` and
 * `minecraft:` are optional.
 */
function blockTag(id: string): BlockValue {
  return new BlockValue(id.startsWith("#") ? id : `#${id}`);
}

/**
 * A block from any id, or a generated member like `Block.GRASS_BLOCK`. Prefer
 * `Block.tag(...)` for tags.
 */
export const Block = Object.assign(
  withMembers(
    (id: string, states?: BlockStates): BlockValue =>
      new BlockValue(id, states),
    BLOCK_IDS,
    (id) => new BlockValue(id),
  ),
  { tag: blockTag },
);
