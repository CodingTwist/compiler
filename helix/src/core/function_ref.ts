import { FunctionContext } from "./frontend";
import type { Score } from "./frontend/nodes/score";
import { FunctionNode } from "./ir/node";
import { VersionProfile } from "../versions/profile";
import { runInContext } from "./frontend/context/ambient";

export class FunctionRef {
  constructor(
    public node: FunctionNode,
    public version: VersionProfile,
  ) {}

  build(builder: (ctx: FunctionContext) => void) {
    const ctx = new FunctionContext(this.node, this.version);
    runInContext(ctx, builder);
  }

  getName() {
    return this.node.name;
  }
}
/** A function built by `dp.fn`: score params, and a score result if `returns`. Call it with `ctx.invoke`. */
export class CallableFn<P extends Score[] = Score[]> extends FunctionRef {
  constructor(
    node: FunctionNode,
    version: VersionProfile,
    public readonly params: P,
    public readonly returns: boolean,
  ) {
    super(node, version);
  }
}
