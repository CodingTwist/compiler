// Where generated helper functions live: a `zzz/` folder beside their owner, so they sort
// after authored functions.

/** Folder all compiler-/engine-generated helper functions live under. */
export const PRIVATE_ROOT = "zzz";

/** Whether `name` is under a `zzz/` helper folder. */
export function isPrivate(name: string): boolean {
  return name.split("/").includes(PRIVATE_ROOT);
}

/** The private path for `name`: `mace/tick_one` → `mace/zzz/tick_one`. Idempotent. */
export function privateName(name: string): string {
  if (isPrivate(name)) return name;
  const slash = name.indexOf("/");
  if (slash < 0) return `${PRIVATE_ROOT}/${name}`;
  return `${name.slice(0, slash)}/${PRIVATE_ROOT}/${name.slice(slash + 1)}`;
}

/** A private helper under `parent`: `mace/tick` → `mace/zzz/tick/if_0`. */
export function privateChild(parent: string, leaf: string): string {
  if (isPrivate(parent)) return `${parent}/${leaf}`;
  if (!parent.includes("/")) return `${PRIVATE_ROOT}/${parent}/${leaf}`;
  return privateName(`${parent}/${leaf}`);
}
