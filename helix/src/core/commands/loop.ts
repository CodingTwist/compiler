// `ctx.while(cond, body, opts)` and `ctx.repeat(n, body)`: loops as private recursive functions.
//
//   ctx.repeat(3, (c, i) => c.tellraw(Selector.allPlayers(), [i]));
//   ctx.while(Detect.block(Pos.here(), AIR), () => steps.remove(1), {
//     advance: (e) => e.positioned(Pos.local(0, 0, 0.5)),
//   }).else((c) => c.say("hit"));
import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { commitLines, functionCall } from "../ir/generate";
import { callLine } from "../ir/line-info";
import { supportsCommand } from "../../versions/capabilities";
import { VersionProfile } from "../../versions/profile";
import { FunctionContext } from "../frontend/context";
import { runInContext } from "../frontend/context/ambient";
import type { Score } from "../frontend/nodes/score";
import type { Detector } from "../frontend/detect";
import { IfElseNode, IfHandler, resolveCondition, type Condition } from "./if";
import { allocLocal } from "./local";

/** The `else` continuation returned by `ctx.while(...)`. */
export interface LoopBuilder {
  /** Runs where the loop stopped, once its condition fails. A `return` in the body skips it. */
  else(fn: (ctx: FunctionContext) => void): void;
}

/** Options for `ctx.while`. */
export interface LoopOptions {
  /** Context shifts for each next pass, e.g. `(e) => e.positioned(Pos.local(0, 0, 0.5))`. */
  advance?: Detector;
}

/** A call to a loop function, whose lines are `step`: pass then recurse, else exit. */
export class LoopNode extends ASTNode {
  type = "loop";

  constructor(
    public loop: FunctionNode,
    public step: IfElseNode,
  ) {
    super();
  }
}

export class LoopHandler extends CommandHandler<LoopNode> {
  type = "loop";

  generate(node: LoopNode, ctx: CodegenContext): void {
    const { name } = node.loop;
    // A body can be rendered more than once (folding tries it), but the function is written once.
    if (!ctx.datapack.files.has(name))
      commitLines(
        name,
        ctx.datapack,
        new IfHandler().branchLines(node.step, ctx, true),
      );
    ctx.emit(functionCall(ctx.datapack, name), callLine(name));
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Runs `body` while `cond` holds, checked before each pass.
     *
     * Compiles to a recursive function, so the command chain limit caps passes per tick. A
     * `return` at the top of the body ends the loop and returns its value. Needs `return run`.
     */
    while(
      cond: Condition,
      body: (ctx: FunctionContext) => void,
      opts?: LoopOptions,
    ): LoopBuilder;
    /** Runs `body` `n` times, with `i` counting up from 0 in a local. */
    repeat(
      n: number | Score,
      body: (ctx: FunctionContext, i: Score) => void,
    ): void;
  }
}

FunctionContext.prototype.while = function (
  this: FunctionContext,
  cond: Condition,
  body: (ctx: FunctionContext) => void,
  opts: LoopOptions = {},
): LoopBuilder {
  // Without `return run` the exit branch can't be skipped once a deeper pass has run.
  if (!supportsCommand(this.version, ["return", "run"])) {
    throw new Error(
      `ctx.while needs \`return run\`, which ${this.version.id} lacks`,
    );
  }
  const child = (fn: FunctionNode): FunctionContext =>
    new (this.constructor as new (
      fn: FunctionNode,
      v: VersionProfile,
    ) => FunctionContext)(fn, this.version);
  const loop = this.createChildFunction("while");
  const loopCtx = child(loop);

  const pass = loopCtx.createChildFunction("pass");
  runInContext(child(pass), (c) => {
    body(c);
    const next = c.execute();
    opts.advance?.(next);
    // `return run` so a value returned deeper reaches the loop's caller.
    next.runOrInline((r) => r.returnRun((x) => x.emit(loop)));
  });

  const step = new IfElseNode(resolveCondition(loopCtx, cond), pass);
  this.emit(new LoopNode(loop, step));
  return {
    else: (fn) => {
      const exit = loopCtx.createChildFunction("else");
      runInContext(child(exit), fn);
      step.elseBody = exit;
    },
  };
};

FunctionContext.prototype.repeat = function (
  this: FunctionContext,
  n: number | Score,
  body: (ctx: FunctionContext, i: Score) => void,
): void {
  const i = allocLocal(this.fn).set(0, this);
  this.while(i.lessThan(n), (c) => {
    body(c, i);
    i.add(1, c);
  });
};
