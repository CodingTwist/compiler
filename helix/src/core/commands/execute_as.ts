import { generateSingleNode } from "../ir/generate";
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
 * Vanilla commands whose first argument is a *multi-target* entity list and for
 * which `execute as <S> run <cmd> @s …` is exactly equivalent to `<cmd> <S> …`.
 * `as` rebinds only the executor (`@s`) - never position/rotation/dimension - so
 * for these "do it to each of these entities" commands, selecting the targets
 * directly runs the same work once per matched entity with no `execute` wrapper.
 * Deliberately conservative: commands with a *single-entity* slot (e.g. `data …
 * from entity @s`, where a multi-entity selector would be invalid) are excluded.
 */
const FOLDABLE_AS_TARGET = new Set([
  "effect",
  "tag",
  "give",
  "kill",
  "tellraw",
  "title",
]);

// A standalone `@s` token: not part of a longer word and not carrying its own
// `[...]` predicate block (folding would drop those predicates, so we bail).
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
        raw(`run ${command}`),
      ]),
    );
  }

  /**
   * Collapse `execute as <selector> run <command>` into `<command>` with
   * `@s` replaced by `<selector>`, when that is provably identity-preserving:
   * the command is one of {@link FOLDABLE_AS_TARGET} and references the executor
   * exactly once via a bare `@s`. Returns the folded line, or `undefined` to
   * keep the explicit `execute as … run …`.
   */
  private fold(command: string, selector: string): string | undefined {
    const keyword = command.slice(0, command.indexOf(" "));
    if (!FOLDABLE_AS_TARGET.has(keyword)) return undefined;
    // Exactly one executor reference, and none carrying `@s[...]` predicates
    // (which the substitution can't preserve).
    if (/@s\[/.test(command)) return undefined;
    const refs = command.match(BARE_SELF);
    if (!refs || refs.length !== 1) return undefined;
    return command.replace(BARE_SELF, selector);
  }
}
