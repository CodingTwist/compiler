import type { Datapack } from "./datapack";
import { ASTNode } from "./node";

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
        this.lines.push(line.toString());
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

export class Dispatcher {
    constructor(private handlers: Map<ASTNode["type"], CommandHandler>) { }

    dispatch(node: ASTNode, ctx: CodegenContext) {
        const handler = this.handlers.get(node.type);
        if (!handler) {
            throw new Error(`No handler for node type '${node.type}'`);
        }
        handler.generate(node, ctx);
    }
}