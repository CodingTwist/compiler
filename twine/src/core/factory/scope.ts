// The `ModuleScope` a module's `register` receives.
import type { Datapack, Id } from "helix";
import type { ModuleScope } from "../module.interface";

/**
 * The {@link ModuleScope} passed to `register`: its dimension and a function factory that uses it.
 */
export function scopeFor(
  dp: Datapack,
  name: string,
  dimension: Id | undefined,
): ModuleScope {
  return {
    name,
    dimension,
    fn(fnName, body, opts) {
      const fn = opts?.public ? dp.public(fnName) : dp.createFunction(fnName);
      fn.build((ctx) => {
        if (dimension) ctx.execute().in(dimension).run(body);
        else body(ctx);
      });
      return fn;
    },
  };
}
