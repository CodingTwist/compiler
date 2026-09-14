import type { Datapack } from "./datapack";
import { ASTNode, TreeCommandNode } from "./node";
import { Token, lit, arg, buildTokens } from "./command-builder";
import type { SourceLoc } from "../debug/sources";
import { commandLine, UNKNOWN_LINE, type LineInfo } from "./line-info";

export abstract class CommandHandler<N extends ASTNode = ASTNode> {
    abstract readonly type: N["type"];
    abstract generate(node: N, ctx: CodegenContext): void;
}

export class CodegenContext {
    public lines: string[] = [];
    /** What each of {@link lines} is, for output passes. */
    public infos: LineInfo[] = [];

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

    /** Emits a line. Without `info` nothing is known about it, so no pass may move it. */
    emit(line: string, info: LineInfo = UNKNOWN_LINE) {
        // Lines with a `$(arg)` macro need a leading `$`; added here for every handler.
        // ponytail: a literal "$(" in text would trigger this too.
        const text = line.toString();
        const macro = text.includes("$(");
        this.lines.push(macro ? `$${text}` : text);
        // A macro line's text isn't known until it runs, so nothing may be shared from it.
        this.infos.push(macro ? { ...info, clauses: [], open: false } : info);
        this.sources.push(this.current);
    }

    /** Emits a non-vanilla line (a native plugin call), exempt from validation. */
    emitExternal(line: string) {
        this.externalLines.add(this.lines.length);
        this.lines.push(line.toString());
        this.infos.push(UNKNOWN_LINE);
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
export class TreeCommandHandler extends CommandHandler<TreeCommandNode> {
    readonly type = "tree-command";

    generate(node: TreeCommandNode, ctx: CodegenContext): void {
        const tokens: Token[] = node.parts.map((p) =>
            p.kind === "literal" ? lit(p.value) : arg(p.value.render(ctx.version)),
        );
        ctx.emit(buildTokens(ctx.version, tokens), commandLine(node.effect, { exits: node.exits }));
    }
}

const TREE_HANDLER = new TreeCommandHandler();

export class Dispatcher {
    constructor(private handlers: Map<ASTNode["type"], CommandHandler>) { }

    dispatch(node: ASTNode, ctx: CodegenContext) {
        // Registered handlers first, else the shared tree handler.
        const handler = this.handlers.get(node.type);
        if (handler) return handler.generate(node, ctx);
        if (node instanceof TreeCommandNode) {
            return TREE_HANDLER.generate(node, ctx);
        }
        throw new Error(`No handler for node type '${node.type}'`);
    }
}
