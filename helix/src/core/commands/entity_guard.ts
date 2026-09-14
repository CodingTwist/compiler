// HAND-WRITTEN. `execute (if|unless) entity <selector> run <command>`.
// E.g. only summon when the entity isn't there, so /reload doesn't duplicate it.
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
import { generateSingleNodeLine, runClause } from "../ir/generate";
import { chainLine, Effect } from "../ir/line-info";
import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { CommandPart, TreeCommandNode } from "../ir/node";
import { litPart, argPart } from "./base";
import { DisplayValue, EntityCondition } from "../values/display";
import { Selector } from "../frontend/nodes/selector";
import { renderExistence } from "./selector";
import { runInContext } from "../frontend/context/ambient";
import { toCommandValue } from "../values/value";
import { VersionProfile } from "../../versions/profile";

export class EntityGuardNode extends ASTNode {
  type = "entity_guard" as const;
  constructor(
    public readonly mode: "if" | "unless",
    /** The entity to test for. A raw string is accepted as an escape hatch. */
    public readonly selector: Selector | string,
    public readonly command: ASTNode,
  ) {
    super();
  }
}

export class EntityGuardHandler extends CommandHandler<EntityGuardNode> {
  readonly type: EntityGuardNode["type"] = "entity_guard";

  generate(node: EntityGuardNode, ctx: CodegenContext): void {
    const { cmd: command, info } = generateSingleNodeLine(
      node.command,
      ctx.datapack,
      ctx.dispatcher,
    );
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit(node.mode),
        lit("entity"),
        arg(renderExistence(node.selector, ctx.version)),
        raw(runClause(command)),
      ]),
      chainLine([undefined], info),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Summons `display` only when `cond` holds, e.g. `ctx.summonIf(cog.notExist, cog)`. One
     * guarded line.
     */
    summonIf(cond: EntityCondition, display: DisplayValue): void;

    /**
     * Runs each command from `build` only when an entity matches `selector` (`mode`
     * defaults to `"if"`).
     * One guarded line per command. Pair with `Selector.volume(...)` for box triggers.
     */
    whenEntity(
      selector: Selector,
      build: (ctx: FunctionContext) => void,
      mode?: "if" | "unless",
    ): void;
  }
}

FunctionContext.prototype.summonIf = function (
  this: FunctionContext,
  cond: EntityCondition,
  display: DisplayValue,
) {
  const summon = new TreeCommandNode("summon", { effect: Effect.EDITS });
  const parts: CommandPart[] = [
    litPart("summon"),
    argPart(DisplayValue.id),
    argPart(display.getPos()),
    argPart(display.toNbt()),
  ];
  summon.parts = parts;
  this.emit(new EntityGuardNode(cond.mode, cond.selector, summon));
};

FunctionContext.prototype.whenEntity = function (
  this: FunctionContext,
  selector: Selector,
  build: (ctx: FunctionContext) => void,
  mode: "if" | "unless" = "if",
): void {
  // Capture the commands into a throwaway function, then re-emit each with the guard.
  const tmp = new FunctionNode(this.fn.name);
  const child = new (this.constructor as new (
    fn: FunctionNode,
    v: VersionProfile,
  ) => FunctionContext)(tmp, this.version);
  runInContext(child, build);
  for (const inner of tmp.nodes) {
    this.emit(new EntityGuardNode(mode, selector, inner));
  }
};
