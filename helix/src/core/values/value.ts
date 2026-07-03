import { VersionProfile } from "../../versions/profile";

/**
 * A domain concept that renders to a single command token (a position, a block,
 * an item, ...). Rendering is deferred to codegen and given the target version,
 * so a concept can encode itself differently per version (e.g. item data
 * components vs NBT) - the author programs with the concept, not the string.
 */
export interface CommandValue {
  render(version: VersionProfile): string;
}

/**
 * What a concept-typed builder argument accepts: the concept itself, or a raw
 * primitive as an escape hatch (passed through verbatim).
 */
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
