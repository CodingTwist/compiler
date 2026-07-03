import { TellrawPart } from "./tellraw_part";
import type { CommandValue } from "../../values/value";
import type { NbtTargetSpec, DataSourceSpec } from "../../commands/data_op";

/**
 * A reference to NBT at a holder (and optional path). It is both a copy
 * **source** (for `set`/`merge`/...) and a tellraw **component** - pass it to
 * `ctx.tellraw` to display the live value (`{"nbt":...,"entity":...}`).
 * `holder.at(path)` produces one; `.slice()` turns it into a string-slice source.
 *
 * Lives in its own leaf module (not data.ts) so the tellraw handler can import
 * it without pulling in data.ts's FunctionContext.prototype augmentation.
 */
export class NbtRef extends TellrawPart {
  constructor(
    readonly target: NbtTargetSpec,
    readonly path?: CommandValue,
  ) {
    super();
  }

  /** Use a substring of the referenced string tag as the source. */
  slice(start?: number, end?: number): DataSourceSpec {
    return { via: "string", target: this.target, path: this.path, start, end };
  }
}
