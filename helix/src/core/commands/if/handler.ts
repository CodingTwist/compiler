// Lowers `ctx.if(...)` to `execute if … run` lines, folding nested guards into one chain.
import { ASTNode, FunctionNode } from "../../ir/node";
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { generateRunTargetLine, generateSingleNodeLine, runClause } from "../../ir/generate";
import { chainLine, type LineInfo } from "../../ir/line-info";
import { buildTokens, lit, raw } from "../../ir/command-builder";
import { foldLink, type ChainLink } from "./links";
import { IfElseNode, PredicateCheckNode, ScoreRangeNode } from "./nodes";
import { linkText, linkTokens } from "./render";

export class IfHandler extends CommandHandler<IfElseNode> {
  type = "if_else";

  generate(node: IfElseNode, ctx: CodegenContext): void {
    this.emitBodyChain(
      ctx,
      [{ kind: "score", mode: "if", cond: node.condition }],
      node.thenBody,
    );

    for (const elif of node.elifs) {
      const elifCall = generateRunTargetLine(
        elif.body,
        ctx.datapack,
        ctx.dispatcher,
      );
      if (!elifCall.cmd) continue;
      this.emitChain(ctx, [{ kind: "score", mode: "if", cond: elif.condition }], elifCall);
    }
    if (node.elseBody) {
      const elseCall = generateRunTargetLine(
        node.elseBody,
        ctx.datapack,
        ctx.dispatcher,
      );
      if (
        elseCall.cmd &&
        (node.condition instanceof ScoreRangeNode ||
          node.condition instanceof PredicateCheckNode)
      ) {
        this.emitChain(ctx, [{ kind: "score", mode: "unless", cond: node.condition }], elseCall);
      }
    }
  }

  /**
   * Folds a body that is just another guard into this chain, so it emits one `execute … if
   * … if … run`
   * instead of `execute … run execute …`. No extra function is created.
   */
  private emitBodyChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    body: FunctionNode,
  ): void {
    if (body.nodes.length === 1) {
      const folded = foldLink(body.nodes[0]);
      if (folded) {
        if (folded.next.kind === "body") {
          this.emitBodyChain(ctx, [...chain, folded.link], folded.next.body);
        } else {
          this.emitNodeChain(ctx, [...chain, folded.link], folded.next.node);
        }
        return;
      }
    }
    const call = generateRunTargetLine(body, ctx.datapack, ctx.dispatcher);
    if (call.cmd) this.emitChain(ctx, chain, call);
  }

  /**
   * Same folding past an `EntityGuardNode`, whose command is a single node, so the terminal
   * renders
   * with `generateSingleNode`.
   */
  private emitNodeChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    node: ASTNode,
  ): void {
    const folded = foldLink(node);
    if (folded) {
      if (folded.next.kind === "body") {
        this.emitBodyChain(ctx, [...chain, folded.link], folded.next.body);
      } else {
        this.emitNodeChain(ctx, [...chain, folded.link], folded.next.node);
      }
      return;
    }
    this.emitChain(ctx, chain, generateSingleNodeLine(node, ctx.datapack, ctx.dispatcher));
  }

  /**
   * The first link is validated; the rest are `raw` because the validator can't follow
   * execute's
   * redirects. Values still render through their typed classes.
   */
  private emitChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    call: { cmd: string; info: LineInfo },
  ): void {
    const [first, ...rest] = chain;
    const tail = [
      ...rest.map((link) => linkText(link, ctx.version)),
      runClause(call.cmd),
    ].join(" ");
    const line = buildTokens(ctx.version, [
      lit("execute"),
      ...linkTokens(first, ctx.version),
      raw(tail),
    ]);
    // Every chain starts with a condition, which can't be shared.
    ctx.emit(line, chainLine([undefined], call.info));
  }
}
