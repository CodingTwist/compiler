import { generateSingleNode, runClause } from "../ir/generate";
import { ASTNode } from "../ir/node";
import { SelectorNode } from "./selector";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";

export class ExecuteAsNode extends ASTNode {
  type = "execute_as" as const;
  constructor(
    public readonly selector: SelectorNode,
    public readonly command: ASTNode,
  ) {
    super();
  }
}

/**
 * Commands where `execute as <S> run <cmd> @s …` equals `<cmd> <S> …`, so the wrapper can
 * be dropped.
 *
 * Only multi-target commands. Single-entity slots (e.g. `data … from entity @s`) are
 * excluded.
 */
const FOLDABLE_AS_TARGET = new Set([
  "effect",
  "tag",
  "give",
  "kill",
  "tellraw",
  "title",
]);

// A bare `@s`, not part of a word and without its own `[...]`.
const BARE_SELF = /@s(?![\w[])/g;

export class ExecuteAsHandler extends CommandHandler<ExecuteAsNode> {
  readonly type: ExecuteAsNode["type"] = "execute_as";

  generate(node: ExecuteAsNode, ctx: CodegenContext): void {
    const selector = generateSingleNode(
      node.selector,
      ctx.datapack,
      ctx.dispatcher,
    );
    const command = generateSingleNode(node.command, ctx.datapack, ctx.dispatcher);

    const folded = this.fold(command, selector);
    if (folded) {
      ctx.emit(folded);
      return;
    }

    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit("as"),
        arg(selector),
        raw(runClause(command)),
      ]),
    );
  }

  /**
   * Folds `execute as <selector> run <command>` into `<command>` with `@s` replaced, when
   * safe:
   * the command is in {@link FOLDABLE_AS_TARGET} and uses a bare `@s` exactly once.
   * Returns `undefined` to keep the `execute`.
   */
  private fold(command: string, selector: string): string | undefined {
    const keyword = command.slice(0, command.indexOf(" "));
    if (!FOLDABLE_AS_TARGET.has(keyword)) return undefined;
    // Exactly one `@s`, and no `@s[...]`, whose filters the substitution would lose.
    if (/@s\[/.test(command)) return undefined;
    const refs = command.match(BARE_SELF);
    if (!refs || refs.length !== 1) return undefined;
    return command.replace(BARE_SELF, selector);
  }
}
