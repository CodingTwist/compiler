import { VersionProfile } from "../../versions/profile";
import type { CodegenContext } from "../ir/commandhandler";

/**
 * A typed value that renders to one command token at codegen, for the target version.
 *
 * `ctx` is only ever supplied by a caller that already has one (a dedicated command
 * handler, or an author rendering explicitly) - most values ignore it and only need
 * `version`. It exists so a value that legitimately needs more than the version (e.g. a
 * `Component()` holding a click event, which resolves through `textJson`) can opt in
 * without every other `CommandValue` in helix carrying that cost.
 */
export interface CommandValue {
  render(version: VersionProfile, ctx?: CodegenContext): string;
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
    typeof x === "object" &&
    x !== null &&
    typeof (x as CommandValue).render === "function"
  );
}

/** Coerce any accepted argument into a `CommandValue` (primitives pass through). */
export function toCommandValue(x: ArgInput): CommandValue {
  if (isCommandValue(x)) return x;
  const text = String(x);
  return { render: () => text };
}
