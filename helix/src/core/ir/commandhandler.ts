import type { Datapack } from "./datapack";
import { ASTNode, CommandNodeBase } from "./node";
import { Token, lit, arg, buildTokens } from "./command-builder";
import type { SourceLoc } from "../debug/sources";

export abstract class CommandHandler<N extends ASTNode = ASTNode> {
    abstract readonly type: N["type"];
    abstract generate(node: N, ctx: CodegenContext): void;
}

export class CodegenContext {
    public lines: string[] = [];

    /**
     * Indices of lines that aren't vanilla commands (native plugin calls) and skip
     * validation.
     */
    public externalLines = new Set<number>();

    /** The author line behind each of {@link lines} (debug source tracking). */
    public sources: (SourceLoc | undefined)[] = [];
    /** Source of the node being dispatched; every line it emits takes it. */
    public current: SourceLoc | undefined;

    constructor(
        public datapack: Datapack,
        public dispatcher: Dispatcher
    ) { }

    emit(line: string) {
        // Lines with a `$(arg)` macro need a leading `$`; added here for every handler.
        // ponytail: a literal "$(" in text would trigger this too.
        const text = line.toString();
        this.lines.push(text.includes("$(") ? `$${text}` : text);
        this.sources.push(this.current);
    }

    /** Emits a non-vanilla line (a native plugin call), exempt from validation. */
    emitExternal(line: string) {
        this.externalLines.add(this.lines.length);
        this.lines.push(line.toString());
        this.sources.push(this.current);
    }

    get version() {
        return this.datapack.version;
    }

    get target() {
        return this.datapack.target;
    }
}

/**
 * The handler for every generated command: renders its parts, validated against the tree.
 * {@link Dispatcher} uses it for any node without its own handler.
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
        // Registered handlers first, else the shared tree handler.
        const handler = this.handlers.get(node.type);
        if (handler) return handler.generate(node, ctx);
        if (node instanceof CommandNodeBase) {
            return TREE_HANDLER.generate(node, ctx);
        }
        throw new Error(`No handler for node type '${node.type}'`);
    }
}
