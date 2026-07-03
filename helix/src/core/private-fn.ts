// Single source of truth for where compiler-/engine-generated helper functions
// live. They are tucked under one folder so they sort *away* from the author's
// entry-point functions in the function list (a leading-underscore name sorted
// them to the top, in the way). Both core control-flow helpers (see
// frontend/context/base.ts) and the spool clip/cutscene engine route their
// generated function names through here.

/** Folder all compiler-/engine-generated helper functions live under. */
export const PRIVATE_ROOT = "zzz";

/**
 * Prefix `name` with the private root, idempotently - a name that is already
 * the root or nested under it is returned unchanged, so composing private names
 * (e.g. a cutscene's already-private base + a child clip) never compounds into
 * `zzz/zzz/...`.
 */
export function privateName(name: string): string {
  if (name === PRIVATE_ROOT || name.startsWith(`${PRIVATE_ROOT}/`)) {
    return name;
  }
  return `${PRIVATE_ROOT}/${name}`;
}
