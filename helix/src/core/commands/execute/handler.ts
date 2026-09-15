// Lowers `execute` chains and `return run` to command lines.
import { ASTNode, FunctionNode } from "../../ir/node";
import { CodegenContext, CommandHandler } from "../../ir/commandhandler";
import { generateRunTargetLine, runClause } from "../../ir/generate";
import { chainLine, worst } from "../../ir/line-info";
import { buildTokens, lit, raw } from "../../ir/command-builder";
import { clause, effect, shared as sharedClause } from "./render";
import { ExecuteNode } from "./types";

export class ExecuteHandler extends CommandHandler<ExecuteNode> {
  readonly type: ExecuteNode["type"] = "execute";

  generate(node: ExecuteNode, ctx: CodegenContext): void {
    const v = ctx.version;
    // A bare chain's result can be a count, so only chains that `run` may limit entity
    // tests to one.
    const existence = !!node.runBody;
    const parts = node.clauses.map((c) =>
      clause(c, v, ctx.datapack.name, existence),
    );
    const shared = node.clauses.map((c, i) => sharedClause(c, parts[i]));
    const own = worst(...node.clauses.map((c) => effect(c)));
    const calls = node.clauses.flatMap((c) =>
      c.k === "callFunction" ? [c.fn.getName()] : [],
    );
    let body;
    if (node.runBody) {
      // An empty body is a no-op unless a `store` clause reads its result.
      const keepEmpty = node.clauses.some((c) => c.k.startsWith("store"));
      const target = generateRunTargetLine(
        node.runBody,
        ctx.datapack,
        ctx.dispatcher,
        { keepEmpty },
      );
      if (!target.cmd) return;
      parts.push(runClause(target.cmd));
      body = target.info;
    }
    ctx.emit(
      buildTokens(v, [lit("execute"), raw(parts.join(" "))]),
      chainLine(shared, body, own, calls),
    );
  }
}

/** `return run <command>`: runs a command and returns its result. Not in the generated `return.ts`. */
export class ReturnRunNode extends ASTNode {
  readonly type = "return_run";
  runBody?: FunctionNode;
}

export class ReturnRunHandler extends CommandHandler<ReturnRunNode> {
  readonly type: ReturnRunNode["type"] = "return_run";

  generate(node: ReturnRunNode, ctx: CodegenContext): void {
    if (!node.runBody) throw new Error("returnRun() body was never built");
    const { cmd, info } = generateRunTargetLine(
      node.runBody,
      ctx.datapack,
      ctx.dispatcher,
      { keepEmpty: true },
    );
    ctx.emit(buildTokens(ctx.version, [lit("return"), raw(`run ${cmd}`)]), {
      ...info,
      clauses: [],
      open: false,
      exits: true,
    });
  }
}
