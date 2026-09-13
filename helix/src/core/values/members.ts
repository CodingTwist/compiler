/**
 * Adds typed members to a factory, so `Block.GRASS_BLOCK` works and typos don't compile.
 *
 * Each member builds a fresh value, so changing one (`Block.FURNACE.state({...})`) doesn't
 * affect the next access. Members are the newest version's ids.
 */
export function withMembers<
  F extends object,
  M extends Readonly<Record<string, string>>,
  V,
>(factory: F, ids: M, make: (id: string) => V): F & { readonly [K in keyof M]: V } {
  const out = factory as F & { [K in keyof M]: V };
  for (const key of Object.keys(ids)) {
    Object.defineProperty(out, key, {
      get: () => make(ids[key]),
      enumerable: true,
    });
  }
  return out;
}
