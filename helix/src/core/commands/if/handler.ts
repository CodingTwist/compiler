// Lowers `ctx.if(...)` to `execute if … run` lines, folding nested guards into one chain.
import { ASTNode, FunctionNode, Range } from "../../ir/node";
import { scoreLitNode } from "../scoreboard";
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { commitLines, FORKS, generateRunTargetLine, generateSingleNodeLine, runClause } from "../../ir/generate";
import { supportsCommand } from "../../../versions/capabilities";
import { chainLine, type LineInfo } from "../../ir/line-info";
import { buildTokens, lit, raw } from "../../ir/command-builder";
import { foldLink, type ChainLink } from "./links";
import { IfElseNode } from "./nodes";
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
      this.emitTracked(node, ctx);
    }
  }

  /**
   * Lowers if/elif/else into one private function where each branch is `return run`, so at
   * most one runs and each condition is checked before any body has run.
   */
  private emitBranches(node: IfElseNode, ctx: CodegenContext): void {
    const call = commitLines(`${node.thenBody.name}_chain`, ctx.datapack, this.branchLines(node, ctx));
    ctx.emit(call.cmd, call.info);
  }

  /**
   * The lines of {@link emitBranches}' branch function, uncommitted.
   *
   * `returnElse` returns the else body's result too, so a loop's exit value reaches its caller.
   */
  branchLines(node: IfElseNode, ctx: CodegenContext, returnElse = false): CodegenContext {
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
      const call = generateRunTargetLine(node.elseBody, dp, dispatcher, returnElse ? { inline } : {});
      if (call.cmd && returnElse) branch.emit(`return run ${call.cmd}`, { ...call.info, exits: true });
      else if (call.cmd) branch.emit(call.cmd, call.info);
    }
    return branch;
  }

  /**
   * Pre-`return run` lowering: every condition sets `taken` to its branch number unless an
   * earlier one did, then each body runs under its number, so conditions are all checked first.
   */
  private emitTracked(node: IfElseNode, ctx: CodegenContext): void {
    const { taken } = node;
    if (!taken) throw new Error(`if/elif/else on ${ctx.version.id} needs a local, which ctx.if allocates`);
    const { datapack: dp, dispatcher } = ctx;
    const is = (n: number): ChainLink => ({
      kind: "clauses",
      clauses: [{ k: "scoreMatches", mode: "if", score: taken, range: Range.exactly(n) }],
    });
    dispatcher.dispatch(scoreLitNode("set", taken, 0), ctx);
    const branches = [{ condition: node.condition, body: node.thenBody }, ...node.elifs];
    branches.forEach(({ condition }, i) => {
      const mark = generateSingleNodeLine(scoreLitNode("set", taken, i + 1), dp, dispatcher);
      for (const clauses of toChains(condition)) this.emitChain(ctx, [is(0), { kind: "clauses", clauses }], mark);
    });
    branches.forEach(({ body }, i) => this.emitBodyChain(ctx, [is(i + 1)], body));
    if (node.elseBody) this.emitBodyChain(ctx, [is(0)], node.elseBody);
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
