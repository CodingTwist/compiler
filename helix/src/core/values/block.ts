import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";
import { withMembers } from "./members";
import { BLOCK_IDS } from "../../versions/data/ids";

/**
 * The vanilla block *tags* (`BLOCK_TAGS.AIR = "minecraft:air"`), the newest-version
 * superset - typed, autocompleted, typo-checked ids for `Block.tag(...)` so authors
 * never hand-write `"#minecraft:air"`. Generated in versions/data/ids.ts.
 */
export { BLOCK_TAGS } from "../../versions/data/ids";

/**
 * A block, with optional block-state properties and block-entity data
 * (`block_state` / `block_predicate`):
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
  private nbt?: string;

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

  data(nbt: string): this {
    this.nbt = nbt;
    return this;
  }

  render(): string {
    let out = normalizeBlockId(this.id);
    const entries = Object.entries(this.states);
    if (entries.length > 0) {
      out += `[${entries.map(([k, v]) => `${k}=${v}`).join(",")}]`;
    }
    if (this.nbt !== undefined) out += this.nbt;
    return out;
  }

  /**
   * The NBT compound form used by `block_display` / `block_state` fields
   * (`{Name, Properties}`), as opposed to the `id[state]` string form `render`
   * produces. Property values are stringified, as the format requires.
   */
  toBlockState(): { Name: string; Properties?: Record<string, string> } {
    const entries = Object.entries(this.states);
    const state: { Name: string; Properties?: Record<string, string> } = {
      Name: normalizeBlockId(this.id),
    };
    if (entries.length > 0) {
      state.Properties = Object.fromEntries(
        entries.map(([k, v]) => [k, String(v)]),
      );
    }
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
 * Build a block *tag* (`#namespace:path`) - matches any block the tag contains,
 * for `if block` / `fill replace` predicate positions. Prefer the typed vanilla
 * ids: `Block.tag(BLOCK_TAGS.AIR)` -> `#minecraft:air` (autocompleted, typo-checked).
 * A raw string also works (`Block.tag("air")`); a leading `#` is optional (added
 * if absent) and the namespace defaults to `minecraft:`.
 */
function blockTag(id: string): BlockValue {
  return new BlockValue(id.startsWith("#") ? id : `#${id}`);
}

/**
 * Build a block from any id (custom namespaces, `#tags`, block states), or use
 * a generated member for a known vanilla block: `Block.GRASS_BLOCK`. For a tag,
 * prefer the typed `Block.tag("air")` over the `Block("#…")` string form.
 */
export const Block = Object.assign(
  withMembers(
    (id: string, states?: BlockStates): BlockValue => new BlockValue(id, states),
    BLOCK_IDS,
    (id) => new BlockValue(id),
  ),
  { tag: blockTag },
);
