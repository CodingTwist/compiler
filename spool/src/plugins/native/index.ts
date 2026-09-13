import { FunctionContext, Id } from "helix";
import type { Selector, Pos } from "helix";
import type { KitPlugin } from "../../plugin";

// The builder `ctx.native(...)` returns, for chaining `.fallback(...)`.
type NativeCall = ReturnType<FunctionContext["native"]>;

/**
 * Typed commands of the companion Paper plugin, e.g. `ctx.paper().pathfind(target, to)`.
 *
 * Each returns a {@link NativeCall}, so you can add a `.fallback(...)` for vanilla builds.
 * Lives in spool because it's specific to one server plugin.
 */
export class PaperOps {
  constructor(private readonly ctx: FunctionContext) {}

  /** Any plugin command without a named wrapper yet. Same as `ctx.native`. */
  call(...args: Parameters<FunctionContext["native"]>): NativeCall {
    return this.ctx.native(...args);
  }

  /**
   * Moves `target` to `to` with the server's pathfinder. Server-only unless given a
   * `.fallback(...)`.
   */
  pathfind(target: Selector, to: Pos): NativeCall {
    return this.ctx.native(Id("paper:pathfind"), target, to);
  }
}

declare module "helix" {
  interface FunctionContext {
    /**
     * The companion Paper plugin's ops. Only emitted on `target: "paper"` builds. See
     * {@link PaperOps}.
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
