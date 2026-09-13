// Single source of truth for where compiler-/engine-generated helper functions
// live. They are tucked into a `zzz/` folder inside the folder they belong to
// (`mace/zzz/...`), so they sort *away* from the author's entry-point functions
// (a leading-underscore name sorted them to the top, in the way). Both core control-flow helpers (see
// frontend/context/base.ts) and the spool clip/cutscene engine route their
// generated function names through here.

/** Folder all compiler-/engine-generated helper functions live under. */
export const PRIVATE_ROOT = "zzz";

function isPrivate(name: string): boolean {
  return name.split("/").includes(PRIVATE_ROOT);
}

/**
 * The private home for `name`, next to the folder it belongs to: `mace/tick_one`
 * → `mace/zzz/tick_one`; a top-level `clock` → `zzz/clock`. Idempotent - a name
 * already holding a `zzz` segment is returned unchanged, so composing private
 * names (a cutscene's private base + a child clip) never compounds.
 */
export function privateName(name: string): string {
  if (isPrivate(name)) return name;
  const slash = name.indexOf("/");
  if (slash < 0) return `${PRIVATE_ROOT}/${name}`;
  return `${name.slice(0, slash)}/${PRIVATE_ROOT}/${name.slice(slash + 1)}`;
}

/**
 * A private helper nested under `parent` (control-flow bodies): `mace/tick` →
 * `mace/zzz/tick/if_0`, then `mace/zzz/tick/if_0/at_0`; a top-level `tick` →
 * `zzz/tick/if_0`.
 */
export function privateChild(parent: string, leaf: string): string {
  if (isPrivate(parent)) return `${parent}/${leaf}`;
  if (!parent.includes("/")) return `${PRIVATE_ROOT}/${parent}/${leaf}`;
  return privateName(`${parent}/${leaf}`);
}
