// Where private functions live. `split` mirrors the tree under one `zzzprivate/` folder;
// `beside` puts a `zzz/` folder inside each owner. Both sort after authored functions.

/** How private functions are laid out in the output. */
export type FunctionLayout = "split" | "beside";

/** Top-level folder for private functions in the `split` layout. */
export const SPLIT_ROOT = "zzzprivate";
/** Top-level folder for shared plugin code, public and private, in every layout. */
export const PLUGIN_ROOT = "zzzplugin";
/** Per-owner folder for private functions in the `beside` layout. */
export const BESIDE_ROOT = "zzz";

/** Whether `name` sits in a private or plugin folder, in either layout. */
export function isPrivate(name: string): boolean {
  const parts = name.split("/");
  return (
    parts[0] === SPLIT_ROOT ||
    parts[0] === PLUGIN_ROOT ||
    parts.includes(BESIDE_ROOT)
  );
}

/** The private path for `name`: `mace/tick_one` → `zzzprivate/mace/tick_one`. Idempotent. */
export function privateName(name: string, layout: FunctionLayout): string {
  if (isPrivate(name)) return name;
  if (layout === "split") return `${SPLIT_ROOT}/${name}`;
  const slash = name.indexOf("/");
  if (slash < 0) return `${BESIDE_ROOT}/${name}`;
  return `${name.slice(0, slash)}/${BESIDE_ROOT}/${name.slice(slash + 1)}`;
}

/** A private helper under `parent`: `mace/tick` → `zzzprivate/mace/tick/if_0`. */
export function privateChild(
  parent: string,
  leaf: string,
  layout: FunctionLayout,
): string {
  if (isPrivate(parent)) return `${parent}/${leaf}`;
  if (layout === "beside" && !parent.includes("/"))
    return `${BESIDE_ROOT}/${parent}/${leaf}`;
  return privateName(`${parent}/${leaf}`, layout);
}
