import { CommandNodeBase } from "./node";
import { CodegenContext, CommandHandler } from "./commandhandler";
import { Token, lit, arg, buildTokens } from "./command-builder";

/**
 * Default handler for a "mechanical" command: render its accumulated
 * literal/arg `parts` as tokens, validated against the target version's command
 * tree. Each command's handler is a thin subclass that just sets `type`, so the
 * dispatcher can route by the command's own node type. Commands that need a
 * version-dependent encoding (give's NBT vs components, ...) override
 * `generate` or use a `VariadicHandler` instead.
 */
export abstract class TreeCommandHandler<
  N extends CommandNodeBase,
> extends CommandHandler<N> {
  generate(node: N, ctx: CodegenContext): void {
    const tokens: Token[] = node.parts.map((p) =>
      p.kind === "literal" ? lit(p.value) : arg(p.value.render(ctx.version)),
    );
    ctx.emit(buildTokens(ctx.version, tokens));
  }
}
