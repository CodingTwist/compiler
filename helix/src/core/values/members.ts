/**
 * Attach typed member accessors to a concept factory, so an author can write
 * `Block.GRASS_BLOCK` instead of `Block("grass_block")` - and a typo like
 * `Block.GRSS_BLOCK` fails to compile, which a bare string never would.
 *
 * `ids` is a generated map of `MEMBER_KEY -> "minecraft:id"` (see
 * versions/data/ids.ts). Each member is a getter that builds a FRESH concept
 * via `make`, so mutating one (`Block.FURNACE.state({...})`) never leaks into
 * the next access of the same member.
 *
 * The member set is the newest-version superset (same policy as the rest of the
 * id data); per-version correctness remains the runtime registry validation's
 * job. Custom / tagged ids stay available through the factory call form.
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
