import { CommandValue } from "./value";

/**
 * A **macro argument** - `$(name)` - substituted by the server when the
 * function is called with arguments (`ctx.callWith(fn, …)`).
 *
 * Drop one anywhere a command takes a value; the line it lands on is emitted
 * with the required leading `$` automatically (see `CodegenContext.emit`).
 *
 * ```ts
 * dp.function("place", (ctx) => ctx.setblock(Macro("pos"), Block.STONE));
 * ctx.callWith(place, Nbt({ pos: "1 2 3" }));   // function ns:place {pos:"1 2 3"}
 * ```
 *
 * Macros are a last resort: they re-parse the command every call and cannot be
 * validated. Reach for a score, a storage read, or a plain argument first.
 *
 * The generic slots it into a typed parameter (`Macro<Pos>("pos")`); it
 * defaults to `any` so no cast is needed - the value only exists at runtime,
 * so there is nothing to type-check anyway.
 */
export function Macro<T = any>(name: string): T & CommandValue {
  const token = `$(${name})`;
  return {
    render: () => token,
    toString: () => token,
  } as T & CommandValue;
}
