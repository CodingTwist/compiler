import type { Datapack } from "./datapack";
import { ASTNode, CommandNodeBase } from "./node";
import { Token, lit, arg, buildTokens } from "./command-builder";

export abstract class CommandHandler<N extends ASTNode = ASTNode> {
    abstract readonly type: N["type"];
    abstract generate(node: N, ctx: CodegenContext): void;
}

export class CodegenContext {
    public lines: string[] = [];

    /**
     * Indices into {@link lines} that are NOT vanilla commands (e.g. a native
     * Paper plugin call) and so must skip validation against the version's
     * Brigadier tree. See {@link emitExternal} and `generateFunction`.
     */
    public externalLines = new Set<number>();

    constructor(
        public datapack: Datapack,
        public dispatcher: Dispatcher
    ) { }

    emit(line: string) {
        // A line carrying a `$(arg)` macro substitution must be marked with a
        // leading `$`. Done here so every handler gets it for free.
        // ponytail: a literal "$(" in e.g. a tellraw string would also trip
        // this; pass the text differently if that ever bites.
        const text = line.toString();
        this.lines.push(text.includes("$(") ? `$${text}` : text);
    }

    /**
     * Emit a line that is not a vanilla command (a native plugin call) - it is
     * recorded as exempt from Brigadier validation, which would reject its
     * unknown leading keyword.
     */
    emitExternal(line: string) {
        this.externalLines.add(this.lines.length);
        this.lines.push(line.toString());
    }

    get version() {
        return this.datapack.version;
    }

    get target() {
        return this.datapack.target;
    }
}

/**
 * The handler for every "mechanical" command: render the node's accumulated
 * literal/arg `parts` as tokens, validated against the target version's command
 * tree. One shared instance serves all of them - {@link Dispatcher} falls back to
 * it for any {@link CommandNodeBase} without a registered handler, so a generated
 * command needs no handler class of its own. Commands whose lowering is
 * version-dependent (give's NBT vs components, ...) register their own handler.
 */
export class TreeCommandHandler extends CommandHandler<CommandNodeBase> {
    readonly type = "tree-command";

    generate(node: CommandNodeBase, ctx: CodegenContext): void {
        const tokens: Token[] = node.parts.map((p) =>
            p.kind === "literal" ? lit(p.value) : arg(p.value.render(ctx.version)),
        );
        ctx.emit(buildTokens(ctx.version, tokens));
    }
}

const TREE_HANDLER = new TreeCommandHandler();

export class Dispatcher {
    constructor(private handlers: Map<ASTNode["type"], CommandHandler>) { }

    dispatch(node: ASTNode, ctx: CodegenContext) {
        // Registered handlers first; anything that is just command parts (every
        // generated command) falls back to the shared tree handler, so mechanical
        // commands need no handler class of their own.
        const handler = this.handlers.get(node.type);
        if (handler) return handler.generate(node, ctx);
        if (node instanceof CommandNodeBase) {
            return TREE_HANDLER.generate(node, ctx);
        }
        throw new Error(`No handler for node type '${node.type}'`);
    }
}
