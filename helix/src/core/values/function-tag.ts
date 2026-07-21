import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";

/**
 * A reference to a **function tag** - the `#namespace:name` form that `function`
 * and `schedule` accept in place of a single function id.
 *
 * A tag is a fan-out hook: several functions join it and one call runs them all.
 * The datapack owns the members (see {@link Datapack.functionTag}); this value is
 * just the typed way to *name* the tag at a call site, so no caller ever writes
 * a `"#ns:name"` string by hand.
 */
export class FunctionTagRefValue implements CommandValue {
  constructor(
    readonly namespace: string,
    readonly name: string,
  ) {}

  /** The bare id without the leading `#` (`tunnel:entrance`). */
  get id(): string {
    return `${this.namespace}:${this.name}`;
  }

  render(_version: VersionProfile): string {
    return `#${this.id}`;
  }
}

export type FunctionTagRef = FunctionTagRefValue;

export const FunctionTagRef = (namespace: string, name: string): FunctionTagRefValue =>
  new FunctionTagRefValue(namespace, name);
