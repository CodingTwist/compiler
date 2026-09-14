// `ctx.allow(rule, reason)`: silences a report lint for the function being built.
//
//   dp.function("mace/tick", (ctx) => {
//     ctx.allow("nbt-read", "landing check, airborne only");
//   });
import { FunctionContext } from "../frontend/context";
import type { LintRule } from "../report/cost/types";

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Marks this function's hits of lint `rule` as intentional, including what it calls.
     * Applies to the authored function even from inside an `if` body, since those bodies
     * may be inlined or renamed.
     */
    allow(rule: LintRule, reason: string): void;
  }
}

FunctionContext.prototype.allow = function (this: FunctionContext, rule: LintRule, reason: string): void {
  this.fn.root.allows.set(rule, reason);
};
