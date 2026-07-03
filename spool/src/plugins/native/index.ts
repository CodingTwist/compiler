import { FunctionContext, Id } from "helix";
import type { Selector, Pos } from "helix";
import type { KitPlugin } from "../../plugin";

// The `NativeCall` builder type (returned by `ctx.native(...)`), derived so we
// don't reach for a deep helix export - it's the handle authors chain
// `.fallback(...)` onto for graceful degradation on a non-paper build.
type NativeCall = ReturnType<FunctionContext["native"]>;

/**
 * Typed catalogue of the companion Paper plugin's Brigadier commands. Each op is
 * a thin, named wrapper over the core `ctx.native(...)` escape hatch: it pins the
 * `namespace:command` id and forwards typed values, so authors call
 * `ctx.paper().pathfind(target, to)` instead of stringly `ctx.native("paper:...")`.
 * Every op returns the {@link NativeCall} builder, so a `.fallback(...)` can be
 * attached for the vanilla/singleplayer build.
 *
 * This catalogue lives in spool, not core: the Paper command names/signatures are
 * an opinion about a specific server plugin, which the un-opinionated compiler
 * core must not carry. Extend it by adding methods here as the plugin grows.
 */
export class PaperOps {
  constructor(private readonly ctx: FunctionContext) {}

  /**
   * Escape hatch for any command the plugin exposes that doesn't have a named
   * wrapper yet - same contract as `ctx.native`, just reached through `.paper()`.
   */
  call(...args: Parameters<FunctionContext["native"]>): NativeCall {
    return this.ctx.native(...args);
  }

  /**
   * Move `target` to `to` using the server's native pathfinder (a per-tick A*
   * sweep that is impractical as command expansion). Server-only unless you add
   * a `.fallback(...)`.
   */
  pathfind(target: Selector, to: Pos): NativeCall {
    return this.ctx.native(Id("paper:pathfind"), target, to);
  }
}

declare module "helix" {
  interface FunctionContext {
    /**
     * Access the companion Paper plugin's native ops (installed by the `native`
     * plugin). Only emitted on a `target: "paper"` build; each op can carry a
     * `.fallback(...)` for the vanilla build. See {@link PaperOps}.
     */
    paper(): PaperOps;
  }
}

export const native: KitPlugin = {
  name: "native",
  install() {
    FunctionContext.prototype.paper = function (this: FunctionContext): PaperOps {
      return new PaperOps(this);
    };
  },
};
