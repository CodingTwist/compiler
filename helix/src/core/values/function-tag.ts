import { VersionProfile } from "../../versions/profile";
import { CommandValue } from "./value";

/**
 * A reference to a function tag (`#namespace:name`). Members are set with {@link
 * Datapack.functionTag}.
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
