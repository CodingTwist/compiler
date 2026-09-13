import { TellrawPart } from "./tellraw_part";
import type { CommandValue } from "../../values/value";
import type { NbtTargetSpec, DataSourceSpec } from "../../commands/data_op";

/**
 * A reference to NBT at a holder and path, usable as a copy source or a tellraw component.
 *
 * Its own module so the tellraw handler can import it without data.ts's prototype
 * augmentation.
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
