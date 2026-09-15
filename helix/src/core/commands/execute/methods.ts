// Installs `ctx.execute()` and the shortcuts built on it (atEntity, whenItems, returnRun, dispatchScore).
import { Range } from "../../ir/node";
import { FunctionContext } from "../../frontend/context";
import { runInContext } from "../../frontend/context/ambient";
import { Score } from "../../frontend/nodes/score";
import { Selector } from "../../frontend/nodes/selector";
import { ItemSlot, Swizzle } from "../../values";
import { ItemValue } from "../../values/item";
// Type-only: erased at runtime, so it can't form the import cycle a value import would.
import type { FunctionRef } from "../../function_ref";
import { ExecuteBuilder } from "./builder";
import { ReturnRunNode } from "./handler";
import { ExecuteNode, type Cond } from "./types";

declare module "../../frontend/context" {
  interface FunctionContext {
    /** A general `execute … run …` chain. See {@link ExecuteBuilder}. */
    execute(): ExecuteBuilder;
    /**
     * Runs the commands from `build` at `selector` with one `execute at <selector> [align]
     * run …`.
     *
     * Multiple commands go in one child function, so the selector is evaluated once.
     * `align` (e.g. "xyz") snaps to the block grid, needed for block ops at fractional
     * positions.
     */
    atEntity(
      selector: Selector,
      build: (ctx: FunctionContext) => void,
      align?: Swizzle,
    ): void;
    /**
     * Runs the commands from `build` only when `target`'s `slot` holds `item`. See {@link
     * ExecuteBuilder.ifItems}.
     */
    whenItems(
      target: Selector,
      slot: ItemSlot,
      item: ItemValue,
      build: (ctx: FunctionContext) => void,
      mode?: Cond,
    ): void;
    /** `return run <command>` - return the result of running `build`'s command. */
    returnRun(build: (ctx: FunctionContext) => void): void;
    /**
     * Score-range switch: the first matching range calls its function and returns its
     * result.
     */
    dispatchScore(
      score: Score,
      cases: readonly { range: Range; fn: FunctionRef }[],
    ): void;
  }
}

FunctionContext.prototype.execute = function (
  this: FunctionContext,
): ExecuteBuilder {
  const node = new ExecuteNode();
  this.emit(node);
  return new ExecuteBuilder(this, node);
};

FunctionContext.prototype.returnRun = function (
  this: FunctionContext,
  build: (ctx: FunctionContext) => void,
): void {
  const node = new ReturnRunNode();
  this.emit(node);
  const body = this.createChildFunction("return");
  runInContext(new FunctionContext(body, this.version), build);
  node.runBody = body;
};

FunctionContext.prototype.atEntity = function (
  this: FunctionContext,
  selector: Selector,
  build: (ctx: FunctionContext) => void,
  align?: Swizzle,
): void {
  const chain = this.execute().at(selector);
  if (align) chain.align(align);
  chain.run(build);
};

FunctionContext.prototype.whenItems = function (
  this: FunctionContext,
  target: Selector,
  slot: ItemSlot,
  item: ItemValue,
  build: (ctx: FunctionContext) => void,
  mode: Cond = "if",
): void {
  const chain = this.execute();
  (mode === "if" ? chain.ifItems : chain.unlessItems).call(
    chain,
    target,
    slot,
    item,
  );
  chain.run(build);
};

FunctionContext.prototype.dispatchScore = function (
  this: FunctionContext,
  score: Score,
  cases: readonly { range: Range; fn: FunctionRef }[],
): void {
  for (const { range, fn } of cases) {
    this.execute()
      .ifScoreMatches(score, range)
      .run((c) => c.returnRun((x) => x.call(fn)));
  }
};
