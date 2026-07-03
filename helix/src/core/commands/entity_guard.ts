// HAND-WRITTEN. A reusable conditional guard:
//   execute (if|unless) entity <selector> run <command>
// Used e.g. for idempotent spawns - only summon when the group isn't present,
// so a /reload doesn't pile up duplicate copies. Registered via EXTRA_HANDLERS
// in scripts/gen-commands.mjs, never regenerated.
import { generateSingleNode } from "../ir/generate";
import { ASTNode, FunctionNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { CommandPart } from "../ir/node";
import { litPart, argPart } from "./base";
import { SummonNode } from "./summon";
import { DisplayValue, EntityCondition } from "../values/display";
import { Nbt } from "../values/nbt";
import { Selector } from "../frontend/nodes/selector";
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
    const command = generateSingleNode(
      node.command,
      ctx.datapack,
      ctx.dispatcher,
    );
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit(node.mode),
        lit("entity"),
        arg(toCommandValue(node.selector).render(ctx.version)),
        raw(`run ${command}`),
      ]),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Summon `display` only when `cond` holds - e.g. an idempotent spawn:
     * `ctx.summonIf(cog.notExist, cog)`. Emits one guarded line
     * (`execute unless entity <sel> run summon ...`), no helper function.
     */
    summonIf(cond: EntityCondition, display: DisplayValue): void;

    /**
     * Run each command emitted in `build` only when an entity matches `selector`
     * - one `execute (if|unless) entity <selector> run <command>` line per
     * emitted command (`mode` defaults to `"if"`). The body runs against a child
     * context, so this is the API-level way to wrap a block of commands in an
     * entity guard without touching the IR. Pair with `Selector.volume(...)` for
     * "every player inside a box" triggers.
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
  const summon = new SummonNode();
  const parts: CommandPart[] = [
    litPart("summon"),
    argPart(DisplayValue.id),
    argPart(display.getPos()),
    argPart(Nbt(display)),
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
  // Capture the builder's commands into a throwaway function, then re-emit each
  // wrapped in the entity guard (one line per command). Mirrors whenPlayerNear.
  const tmp = new FunctionNode(this.fn.name);
  const child = new (this.constructor as new (
    fn: FunctionNode,
    v: VersionProfile,
  ) => FunctionContext)(tmp, this.version);
  build(child);
  for (const inner of tmp.nodes) {
    this.emit(new EntityGuardNode(mode, selector, inner));
  }
};
