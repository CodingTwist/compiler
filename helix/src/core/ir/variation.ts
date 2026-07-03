import { ASTNode } from "./node";
import { VersionProfile } from "../../versions/profile";
import { CodegenContext, CommandHandler } from "./commandhandler";

/**
 * One way of lowering a node, valid for some version range / capability.
 * `applies` gates on the target version AND whether this specific node is
 * expressible under that encoding; `render` produces the command string.
 */
export interface Variation<N extends ASTNode> {
  applies(node: N, version: VersionProfile): boolean;
  render(node: N, ctx: CodegenContext): string;
}

/**
 * A handler whose output model changes across versions. It stays a stateless
 * singleton (version flows in via ctx); it picks the first applicable
 * variation at call time and throws a readable error if none apply.
 */
export abstract class VariadicHandler<
  N extends ASTNode,
> extends CommandHandler<N> {
  abstract readonly variations: ReadonlyArray<Variation<N>>;

  generate(node: N, ctx: CodegenContext): void {
    const variation = this.variations.find((v) => v.applies(node, ctx.version));
    if (!variation) {
      throw new Error(
        `No '${this.type}' variation applies for Minecraft ${ctx.version.id}`,
      );
    }
    ctx.emit(variation.render(node, ctx));
  }
}
