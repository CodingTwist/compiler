import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";
import { LootFunction } from "./loot-function";

/**
 * A registerable **item modifier** - the JSON written to
 * `data/<ns>/<item_modifier folder>/<name>.json` (via `Datapack.itemModifier`) and
 * applied with `/item modify ... <ref>` or a loot `set_loot`. An item modifier *is*
 * a sequence of {@link LootFunction}s, so it shares the exact loot-function
 * vocabulary used inside loot tables rather than re-modelling it.
 *
 *   dp.itemModifier("sharpen",
 *     new ItemModifier().apply(LootFunction.of("set_name", { name: "Sharpened" })));
 *
 * A single-function modifier emits the bare function object; multiple emit the
 * JSON array form Minecraft also accepts.
 */
export class ItemModifier {
  private readonly functions: LootFunction[] = [];

  /** Append a function to the modifier chain (applied in order). */
  apply(fn: LootFunction): this {
    this.functions.push(fn);
    return this;
  }

  /** The item-modifier JSON: a single function object, or an array of them. */
  toJson(version: VersionProfile): unknown {
    const out = this.functions.map((f) => f.toJson(version));
    return out.length === 1 ? out[0] : out;
  }
}

/** A reference to a registered item modifier (`<ns>:name`). */
export class ItemModifierRef implements CommandValue {
  constructor(readonly id: string) {}
  render(): string {
    return this.id;
  }
}
