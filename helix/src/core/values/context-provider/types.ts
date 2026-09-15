// The `/compute` provider value types, and turning an operand into deferred JSON.
import { VersionProfile } from "../../../versions/profile";
import { CommandValue } from "../value";

/** Deferred JSON: a provider's shape can depend on the target version, like {@link PredicateRef}. */
export type ProviderJson = (version: VersionProfile) => unknown;

export abstract class ProviderBase implements CommandValue {
  constructor(readonly toJson: ProviderJson) {}

  /** The whole tree as one compact command token. */
  render(version: VersionProfile): string {
    return JSON.stringify(this.toJson(version));
  }
}

/** An integer-valued `/compute` expression (`minecraft:context_int_provider`). */
export class ContextIntProvider extends ProviderBase {
  // Brand so int and float providers can't be swapped by accident.
  declare private readonly __int: void;
}

/** A float-valued `/compute` expression (`minecraft:context_float_provider`). */
export class ContextFloatProvider extends ProviderBase {
  declare private readonly __float: void;
}

/** Anywhere an int operand is accepted: a bare number is a constant. */
export type IntRef = number | ContextIntProvider;
/** Anywhere a float operand is accepted: a bare number is a constant. */
export type FloatRef = number | ContextFloatProvider;

export const jsonOf = (x: number | ProviderBase): ProviderJson =>
  typeof x === "number" ? () => x : x.toJson;
