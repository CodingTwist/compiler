// Lowers `ctx.if(...)` to `execute if … run` lines, folding nested guards into one chain.
import { ASTNode, FunctionNode } from "../../ir/node";
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { commitLines, FORKS, generateRunTargetLine, generateSingleNodeLine, runClause } from "../../ir/generate";
import { supportsCommand } from "../../../versions/capabilities";
import { chainLine, type LineInfo } from "../../ir/line-info";
import { buildTokens, lit, raw } from "../../ir/command-builder";
import { foldLink, type ChainLink } from "./links";
import { IfElseNode, not } from "./nodes";
import { toChains } from "./normalize";
import { linkText } from "./render";

export class IfHandler extends CommandHandler<IfElseNode> {
  type = "if_else";

  generate(node: IfElseNode, ctx: CodegenContext): void {
    const chains = toChains(node.condition);
    if (node.elifs.length === 0 && !node.elseBody && chains.length <= 1) {
      if (chains.length) this.emitBodyChain(ctx, [{ kind: "clauses", clauses: chains[0] }], node.thenBody);
    } else if (supportsCommand(ctx.version, ["return", "run"])) {
      this.emitBranches(node, ctx);
    } else {
      this.emitUnguarded(node, ctx);
    }
  }

  /**
   * Lowers if/elif/else into one private function where each branch is `return run`, so at
   * most one runs and each condition is checked before any body has run.
   */
  private emitBranches(node: IfElseNode, ctx: CodegenContext): void {
    const { datapack: dp, dispatcher } = ctx;
    const branch = new CodegenContext(dp, dispatcher);
    // `return run` stops a forking command after its first entity, and a body's own
    // `return` must stay in its own function.
    const inline = (cmd: string, info: LineInfo) => !info.exits && !FORKS.test(cmd);
    for (const { condition, body } of [{ condition: node.condition, body: node.thenBody }, ...node.elifs]) {
      const call = generateRunTargetLine(body, dp, dispatcher, { inline });
      // An empty body still has to stop the later branches.
      const cmd = call.cmd ? `return run ${call.cmd}` : "return 0";
      // Each chain of an `or` returns, so the body runs once however many pass.
      for (const clauses of toChains(condition)) {
        this.emitChain(branch, [{ kind: "clauses", clauses }], { cmd, info: { ...call.info, exits: true } });
      }
    }
    if (node.elseBody) {
      const call = generateRunTargetLine(node.elseBody, dp, dispatcher);
      if (call.cmd) branch.emit(call.cmd, call.info);
    }
    const call = commitLines(`${node.thenBody.name}_chain`, dp, branch);
    ctx.emit(call.cmd, call.info);
  }

  /**
   * Pre-`return run` lowering: one guarded line per branch.
   * Wrong when a body changes a later branch's condition; fixed once locals exist.
   */
  private emitUnguarded(node: IfElseNode, ctx: CodegenContext): void {
    const branches = [
      ...[{ condition: node.condition, body: node.thenBody }, ...node.elifs],
      ...(node.elseBody ? [{ condition: not(node.condition), body: node.elseBody }] : []),
    ];
    for (const { condition, body } of branches) {
      const chains = toChains(condition);
      if (chains.length > 1) throw new Error(`or() in an if needs \`return run\`, which ${ctx.version.id} lacks`);
      const call = generateRunTargetLine(body, ctx.datapack, ctx.dispatcher);
      if (call.cmd && chains.length) this.emitChain(ctx, [{ kind: "clauses", clauses: chains[0] }], call);
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

  /** Emits `call` under the chain's links, or bare when they add no clauses. */
  private emitChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    call: { cmd: string; info: LineInfo },
  ): void {
    const links = chain.map((link) => linkText(link, ctx.version, ctx.datapack.name)).filter(Boolean);
    if (!links.length) return void ctx.emit(call.cmd, call.info);
    const line = buildTokens(ctx.version, [lit("execute"), raw(`${links.join(" ")} ${runClause(call.cmd)}`)]);
    // Every chain starts with a condition, which can't be shared.
    ctx.emit(line, chainLine([undefined], call.info));
  }
}
