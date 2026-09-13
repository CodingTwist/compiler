import { VersionProfile } from "../../versions/profile";

/** A typed value that renders to one command token at codegen, for the target version. */
export interface CommandValue {
  render(version: VersionProfile): string;
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
