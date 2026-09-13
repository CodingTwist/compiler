import { CommandValue } from "./value";

/**
 * A macro argument `$(name)`, filled in when the function is called with `ctx.callWith(fn,
 * …)`.
 *
 * The line gets its leading `$` automatically.
 *
 * ```ts
 * dp.function("place", (ctx) => ctx.setblock(Macro("pos"), Block.STONE));
 * ctx.callWith(place, Nbt({ pos: "1 2 3" }));   // function ns:place {pos:"1 2 3"}
 * ```
 *
 * Last resort: macros re-parse every call and can't be validated. Typed as `T`, default
 * `any`.
 */
export function Macro<T = unknown>(name: string): T & CommandValue {
  const token = `$(${name})`;
  return {
    render: () => token,
    toString: () => token,
  } as T & CommandValue;
}
