// Installs `ctx.if(condition, then).elif(...).else(...)`.
import { ExpressionNode, FunctionNode } from "../../ir/node";
import { VersionProfile } from "../../../versions/profile";
import { FunctionContext } from "../../frontend/context";
import { runInContext } from "../../frontend/context/ambient";
import { ExecuteBuilder } from "../execute/builder";
import { ExecuteNode } from "../execute/types";
import { supportsCommand } from "../../../versions/capabilities";
import { allocLocal } from "../local";
import { toChains } from "./normalize";
import {
  AndNode,
  ClausesNode,
  IfElseNode,
  NotNode,
  OrNode,
  type Condition,
  type IfBuilder,
} from "./nodes";

declare module "../../frontend/context" {
  interface FunctionContext {
    /**
     * `if`/`elif`/`else` control flow; bodies compile to child functions.
     *
     * Takes a condition node, a {@link Detector}, or `and`/`or`/`not` of them.
     */
    if(condition: Condition, thenFn: (ctx: FunctionContext) => void): IfBuilder;
  }
}

/** `c` with its detectors run into clause nodes; they run on a chain that is never emitted. */
export function resolveCondition(
  ctx: FunctionContext,
  c: Condition,
): ExpressionNode {
  if (typeof c === "function") {
    const chain = new ExecuteNode();
    c(new ExecuteBuilder(ctx, chain));
    return new ClausesNode(chain.clauses);
  }
  if (c instanceof AndNode)
    return new AndNode(c.conds.map((x) => resolveCondition(ctx, x)));
  if (c instanceof OrNode)
    return new OrNode(c.conds.map((x) => resolveCondition(ctx, x)));
  if (c instanceof NotNode) return new NotNode(resolveCondition(ctx, c.cond));
  return c;
}

FunctionContext.prototype.if = function (
  this: FunctionContext,
  condition: Condition,
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

  const node = new IfElseNode(resolveCondition(this, condition), thenBody);
  this.emit(node);
  // Without `return run`, an or() or elif/else records the branch that ran in a local.
  const tracks = !supportsCommand(this.version, ["return", "run"]);
  const track = () => {
    if (tracks) node.taken ??= allocLocal(this.fn);
  };
  if (tracks && toChains(node.condition).length > 1) track();

  const builder: IfBuilder = {
    elif: (cond, fn) => {
      const body = this.createChildFunction("elif");
      runInContext(newChild(body), fn);
      node.elifs.push({ condition: resolveCondition(this, cond), body });
      track();
      return builder;
    },
    else: (fn) => {
      const body = this.createChildFunction("else");
      runInContext(newChild(body), fn);
      node.elseBody = body;
      track();
    },
  };

  return builder;
};
