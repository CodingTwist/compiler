import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";
import { NbtValue } from "./nbt";
import type { VersionProfile } from "../../versions/profile";
import { withMembers } from "./members";
import { BLOCK_IDS } from "../../versions/data/ids";
import { DV } from "./entity-versions.generated";
import { warnRawBlockEntityNbt } from "./block-entities";
import type { BlockEntityDataByBlockId } from "./block-entities.generated";

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

export class BlockValue<Id extends string = string> implements CommandValue {
  private states: BlockStates = {};
  private nbt?: string | NbtValue;

  constructor(
    private readonly id: Id,
    states?: BlockStates,
  ) {
    if (states) Object.assign(this.states, states);
  }

  state(props: BlockStates): this {
    Object.assign(this.states, props);
    return this;
  }

  /**
   * Block-entity NBT. A block with a typed factory (`Chest`, `DecoratedPot`, ... - see
   * `block-entities.generated.ts`) only accepts that factory's output; a bare `Nbt(...)` or
   * raw SNBT string is a compile error there, so fix it at the call site. A dynamic/unknown
   * block id keeps the permissive `string | Nbt` form, with a runtime warning instead (the
   * type can't see which block it is).
   */
  data(
    nbt: Id extends keyof BlockEntityDataByBlockId
      ? BlockEntityDataByBlockId[Id]
      : string | NbtValue,
  ): this {
    warnRawBlockEntityNbt(nbt as string | NbtValue, this.baseId());
    this.nbt = nbt as string | NbtValue;
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

  /** The namespaced id or tag, without state or data. */
  baseId(): string {
    return normalizeBlockId(this.id);
  }

  /** This block as `block_predicate` JSON: id or tag, state values and block-entity data. */
  toPredicate(version: VersionProfile): Record<string, unknown> {
    const id = normalizeBlockId(this.id);
    const tag = id.startsWith("#");
    let out: Record<string, unknown>;
    if (version.dataVersion >= DV["1.20.5"]) out = { blocks: id };
    else if (tag) out = { tag: id.slice(1) };
    else if (version.dataVersion >= DV["1.17"]) out = { blocks: [id] };
    else out = { block: id };
    const entries = Object.entries(this.states);
    if (entries.length > 0) {
      out.state = Object.fromEntries(entries.map(([k, v]) => [k, String(v)]));
    }
    if (this.nbt !== undefined) {
      out.nbt = typeof this.nbt === "string" ? this.nbt : this.nbt.render(version);
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
 * `withMembers` types every member (and the callable form) as one plain `BlockValue`,
 * discarding the per-key literal id `BLOCK_IDS`'s `as const` already has - this re-derives
 * it as a type-only overlay (no runtime change) so `Block.CHEST` and `Block("minecraft:chest")`
 * keep their literal id, which is what lets `.data()` above hard-check a known block's NBT.
 */
type BlockFactory = (<const Id extends string>(
  id: Id,
  states?: BlockStates,
) => BlockValue<Id>) & {
  readonly [K in keyof typeof BLOCK_IDS]: BlockValue<(typeof BLOCK_IDS)[K]>;
} & { tag: typeof blockTag };

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
) as BlockFactory;
