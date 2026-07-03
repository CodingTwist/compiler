import { FunctionContext } from "./frontend";
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