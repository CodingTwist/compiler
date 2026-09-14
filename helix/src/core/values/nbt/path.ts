// NBT paths (`Inventory[0].id`).
import { CommandValue } from "../value";

/**
 * An NBT path (`nbt_path`), rendered verbatim:
 *
 *   NbtPath("Inventory[0].id")  -> "Inventory[0].id"
 */
export class NbtPathValue implements CommandValue {
  constructor(private readonly path: string) {}
  render(): string {
    return this.path;
  }

  /** Indexes into a list: `Path.Entity.Pos.index(1)` -> `Pos[1]`. Returns a new path. */
  index(i: number): NbtPathValue {
    return new NbtPathValue(`${this.path}[${i}]`);
  }

  /** Descend into a compound tag: `Path.Player.abilities.child("mayfly")`. */
  child(key: string): NbtPathValue {
    return new NbtPathValue(`${this.path}.${key}`);
  }

  /** Whether this path is `other` or inside it: `Pos[1]` is within `Pos`. */
  within(other: NbtPathValue): boolean {
    const rest = this.path.slice(other.path.length);
    return this.path.startsWith(other.path) && (rest === "" || /^[.[{]/.test(rest));
  }
}

export type NbtPath = NbtPathValue;
export const NbtPath = (path: string): NbtPathValue => new NbtPathValue(path);
