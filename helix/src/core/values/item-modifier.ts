import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";
import { LootFunction } from "./loot-function";

/**
 * An item modifier, registered with `Datapack.itemModifier`: a list of {@link
 * LootFunction}s.
 *
 *   dp.itemModifier("sharpen",
 *     new ItemModifier().apply(LootFunction.of("set_name", { name: "Sharpened" })));
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
