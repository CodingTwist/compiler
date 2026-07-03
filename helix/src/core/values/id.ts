import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";

/**
 * A namespaced resource location (`resource_location`, `resource`,
 * `loot_table`, `dimension`, `particle`, `function`, ...). Defaults the
 * namespace to `minecraft:` and supports tag form (`#...`).
 *
 *   Id("overworld")  -> "minecraft:overworld"
 *   Id("#logs")      -> "#minecraft:logs"
 *   Id("ns:thing")   -> "ns:thing"
 */
export class IdValue implements CommandValue {
  constructor(private readonly id: string) {}

  render(): string {
    if (this.id.startsWith("#")) return "#" + normalizeId(this.id.slice(1));
    return normalizeId(this.id);
  }
}

export type Id = IdValue;

export const Id = (id: string): IdValue => new IdValue(id);
