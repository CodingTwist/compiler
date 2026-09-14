// Installs `ctx.if(condition, then).elif(...).else(...)`.
import { ExpressionNode, FunctionNode } from "../../ir/node";
import { VersionProfile } from "../../../versions/profile";
import { FunctionContext } from "../../frontend/context";
import { runInContext } from "../../frontend/context/ambient";
import { IfElseNode, type IfBuilder } from "./nodes";

declare module "../../frontend/context" {
  interface FunctionContext {
    /** `if`/`elif`/`else` control flow; bodies compile to child functions. */
    if(
      condition: ExpressionNode,
      thenFn: (ctx: FunctionContext) => void,
    ): IfBuilder;
  }
}

FunctionContext.prototype.if = function (
  this: FunctionContext,
  condition: ExpressionNode,
  thenFn: (ctx: FunctionContext) => void,
): IfBuilder {
  // A fully-composed child context over `fn`, carrying this context's version.
  const newChild = (fn: FunctionNode): FunctionContext =>
    new (this.constructor as new (
      fn: FunctionNode,
      v: VersionProfile,
    ) => FunctionContext)(fn, this.version);

  const thenBody = this.createChildFunction("if");
  runInContext(newChild(thenBody), thenFn);

  const node = new IfElseNode(condition, thenBody);
  this.emit(node);

  const builder: IfBuilder = {
    elif: (cond, fn) => {
      const body = this.createChildFunction("elif");
      runInContext(newChild(body), fn);
      node.elifs.push({ condition: cond, body });
      return builder;
    },
    else: (fn) => {
      const body = this.createChildFunction("else");
      runInContext(newChild(body), fn);
      node.elseBody = body;
    },
  };

  return builder;
};
