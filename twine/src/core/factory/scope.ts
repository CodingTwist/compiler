// The `ModuleScope` a module's `register` receives.
import type { Datapack, Id } from "helix";
import type { ModuleScope } from "../module.interface";

/**
 * The {@link ModuleScope} passed to `register`: its dimension and a `createFunction` that uses it.
 */
export function scopeFor(
  dp: Datapack,
  name: string,
  dimension: Id | undefined,
): ModuleScope {
  return {
    name,
    dimension,
    fn(fnName, body) {
      const fn = dp.createFunction(fnName);
      fn.build((ctx) => {
        if (dimension) ctx.execute().in(dimension).run(body);
        else body(ctx);
      });
      return fn;
    },
  };
}
