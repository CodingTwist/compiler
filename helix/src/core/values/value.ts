import { VersionProfile } from "../../versions/profile";

/** A typed value that renders to one command token at codegen, for the target version. */
export interface CommandValue {
  render(version: VersionProfile): string;
  /**
   * What the value points at: only the executing entity, or something every entity shares.
   * Values that point at neither leave it out.
   */
  reach?(): "self" | "world";
}

/** A builder argument: a typed value, or a raw primitive passed through as-is. */
export type ArgInput = CommandValue | string | number | boolean;

function isCommandValue(x: ArgInput): x is CommandValue {
  return (
    typeof x === "object" && x !== null && typeof (x as CommandValue).render === "function"
  );
}

/** Coerce any accepted argument into a `CommandValue` (primitives pass through). */
export function toCommandValue(x: ArgInput): CommandValue {
  if (isCommandValue(x)) return x;
  const text = String(x);
  return { render: () => text };
}
