import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";
import { ItemValue } from "./item";
import { normalizeId } from "../../versions/registry";
import { LootFunction, NumberProvider } from "./loot-function";

/** Per-entry options shared by item/tag/loot-table entries. */
interface EntryOpts {
  /** Selection weight within the pool (default 1). */
  weight?: number;
  /** Functions applied only to this entry's stack. */
  functions?: LootFunction[];
}

/** One loot-pool entry, rendered version-aware. */
class LootEntry {
  constructor(private readonly build: (v: VersionProfile) => Record<string, unknown>) {}
  toJson(version: VersionProfile): Record<string, unknown> {
    return this.build(version);
  }

  /**
   * A `minecraft:item` entry for `item`. If the item carries a stack count or data
   * components, matching `set_count` / `set_components` functions are added
   * automatically (single source - the same `Item` you'd `give`), ahead of any
   * explicit `opts.functions`.
   */
  static item(item: ItemValue, opts: EntryOpts = {}): LootEntry {
    return new LootEntry((v) => {
      const fns: LootFunction[] = [];
      const count = item.getCount();
      if (count !== undefined) fns.push(LootFunction.setCount(count));
      if (Object.keys(item.componentsJson(v)).length) fns.push(LootFunction.setComponents(item));
      fns.push(...(opts.functions ?? []));
      return {
        type: "minecraft:item",
        name: item.baseId(),
        ...(opts.weight !== undefined ? { weight: opts.weight } : {}),
        ...(fns.length ? { functions: fns.map((f) => f.toJson(v)) } : {}),
      };
    });
  }

  /** A `minecraft:loot_table` entry referencing another table by id (or {@link LootTableRef}). */
  static lootTable(ref: string | LootTableRef, opts: EntryOpts = {}): LootEntry {
    const id = ref instanceof LootTableRef ? ref.id : normalizeId(ref);
    return new LootEntry((v) => ({
      type: "minecraft:loot_table",
      value: id,
      ...(opts.weight !== undefined ? { weight: opts.weight } : {}),
      ...(opts.functions?.length ? { functions: opts.functions.map((f) => f.toJson(v)) } : {}),
    }));
  }

  /** An empty entry (a chance to roll nothing). */
  static empty(weight = 1): LootEntry {
    return new LootEntry(() => ({ type: "minecraft:empty", weight }));
  }
}

/** Fluent loot pool: how many rolls, which entries, and pool-wide functions. */
export class LootPool {
  private rollsValue: NumberProvider = 1;
  private readonly entriesList: LootEntry[] = [];
  private readonly functionsList: LootFunction[] = [];

  /** Number of times this pool is rolled (exact or a `{min,max}` range). */
  rolls(n: NumberProvider): this {
    this.rollsValue = n;
    return this;
  }

  /** Add an item entry (see {@link LootEntry.item}). */
  item(item: ItemValue, opts?: EntryOpts): this {
    this.entriesList.push(LootEntry.item(item, opts));
    return this;
  }

  /** Add a nested-loot-table entry. */
  lootTable(ref: string | LootTableRef, opts?: EntryOpts): this {
    this.entriesList.push(LootEntry.lootTable(ref, opts));
    return this;
  }

  /** Add an empty (nothing) entry with `weight`. */
  empty(weight?: number): this {
    this.entriesList.push(LootEntry.empty(weight));
    return this;
  }

  /** A function applied to every entry rolled from this pool. */
  func(fn: LootFunction): this {
    this.functionsList.push(fn);
    return this;
  }

  toJson(version: VersionProfile): Record<string, unknown> {
    return {
      rolls: this.rollsValue,
      entries: this.entriesList.map((e) => e.toJson(version)),
      ...(this.functionsList.length
        ? { functions: this.functionsList.map((f) => f.toJson(version)) }
        : {}),
    };
  }
}

/**
 * A registerable **loot table** - the JSON written to
 * `data/<ns>/<loot_table folder>/<name>.json` (via `Datapack.lootTable`) and
 * referenced from `/loot ... loot <ref>`, container `set_loot`, or a block/mob
 * drop. Built from {@link LootPool}s whose item entries reuse the same
 * {@link ItemValue}s you `give`, so a dropped item is defined once.
 *
 *   dp.lootTable("chests/reward",
 *     new LootTableDef("chest").pool(
 *       new LootPool().rolls(1).item(Item.DIAMOND.count(3))));
 */
export class LootTableDef {
  private readonly pools: LootPool[] = [];
  private readonly functionsList: LootFunction[] = [];

  /**
   * @param type loot-context type id (`chest`, `block`, `entity`, `generic`, ...).
   *   `minecraft:` is prepended to a bare id. Omit for an untyped table.
   */
  constructor(private readonly type?: string) {}

  /** Add a pool (build it with {@link LootPool}). */
  pool(pool: LootPool): this {
    this.pools.push(pool);
    return this;
  }

  /** A function applied to the whole table's output. */
  func(fn: LootFunction): this {
    this.functionsList.push(fn);
    return this;
  }

  /** The loot-table JSON, with embedded values rendered for `version`. */
  toJson(version: VersionProfile): Record<string, unknown> {
    return {
      ...(this.type !== undefined ? { type: normalizeId(this.type) } : {}),
      pools: this.pools.map((p) => p.toJson(version)),
      ...(this.functionsList.length
        ? { functions: this.functionsList.map((f) => f.toJson(version)) }
        : {}),
    };
  }
}

/** A reference to a registered loot table (`<ns>:name`), usable in commands/entries. */
export class LootTableRef implements CommandValue {
  constructor(readonly id: string) {}
  render(): string {
    return this.id;
  }
}
