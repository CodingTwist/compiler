import { generateSingleNode } from "../ir/generate";
import { ASTNode } from "../ir/node";
import { Objective } from "../frontend/nodes/objective";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw, Token } from "../ir/command-builder";
import { VersionProfile } from "../../versions/profile";
import { ScoreTarget } from "../values/score_target";
import { toCommandValue } from "../values/value";

export abstract class StoreTargetNode extends ASTNode {
  abstract type: string;
}

export class StoreScoreNode extends StoreTargetNode {
  type = "store_score";

  constructor(
    public target: ScoreTarget,
    public objective: Objective,
  ) {
    super();
  }
}

export class StoreBossbarNode extends StoreTargetNode {
  type = "store_bossbar";

  constructor(
    public id: string,
    public field: "value" | "max",
  ) {
    super();
  }
}

export class ExecuteStoreNode extends ASTNode {
  type = "execute_store";

  constructor(
    public mode: "result" | "success",
    public destination: StoreTargetNode,
    public command: ASTNode,
  ) {
    super();
  }
}

export class ExecuteStoreHandler extends CommandHandler<ExecuteStoreNode> {
  type = "execute_store";

  generate(node: ExecuteStoreNode, ctx: CodegenContext): void {
    const runCommand = generateSingleNode(
      node.command,
      ctx.datapack,
      ctx.dispatcher,
    );

    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit("store"),
        lit(node.mode),
        ...this.destination(node.destination, ctx.version),
        raw(`run ${runCommand}`),
      ]),
    );
  }

  private destination(dest: StoreTargetNode, version: VersionProfile): Token[] {
    if (dest instanceof StoreScoreNode) {
      return [
        lit("score"),
        arg(toCommandValue(dest.target).render(version)),
        arg(dest.objective.objective),
      ];
    }

    if (dest instanceof StoreBossbarNode) {
      // `<field>` (value|max) is a literal keyword, not an argument.
      return [lit("bossbar"), arg(dest.id), lit(dest.field)];
    }

    throw new Error("Unsupported store destination");
  }
}
