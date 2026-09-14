// Installs `ctx.data()`.
import { FunctionContext } from "../../frontend/context";
import { DataNode } from "./args";
import { DataBuilder } from "./builders";

declare module "../../frontend/context" {
  interface FunctionContext {
    /** `data` - pick a sub-command: `.get()`, `.merge()`, `.modify()`, `.remove()`. */
    data(): DataBuilder;
  }
}

FunctionContext.prototype.data = function (this: FunctionContext) {
  const node = new DataNode();
  this.emit(node);
  return new DataBuilder(node);
};
