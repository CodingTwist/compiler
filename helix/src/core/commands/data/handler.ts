// Renders the chosen `data` leaf's tokens in command-tree order.
import { commandLine } from "../../ir/line-info";
import { CommandHandler, CodegenContext } from "../../ir/commandhandler";
import {
  renderArg,
  buildTokens,
  lit,
  arg,
  Token,
} from "../../ir/command-builder";
import { ArgInput } from "../../values/value";
import { DataNode } from "./args";
import { dataEffect, dataLocal } from "./effects";

export class DataHandler extends CommandHandler<DataNode> {
  readonly type: DataNode["type"] = "data";

  generate(node: DataNode, ctx: CodegenContext): void {
    const v = ctx.version;
    const a = node.args;
    const A = (x: ArgInput) => arg(renderArg(x, v));
    const opt = (x: ArgInput | undefined) => (x !== undefined ? [A(x)] : []);
    let tokens: Token[];
    switch (a.sub) {
      case "getBlock":
        tokens = [
          lit("data"),
          lit("get"),
          lit("block"),
          A(a.targetPos),
          ...opt(a.path),
          ...opt(a.scale),
        ];
        break;
      case "getEntity":
        tokens = [
          lit("data"),
          lit("get"),
          lit("entity"),
          A(a.target),
          ...opt(a.path),
          ...opt(a.scale),
        ];
        break;
      case "getStorage":
        tokens = [
          lit("data"),
          lit("get"),
          lit("storage"),
          A(a.target),
          ...opt(a.path),
          ...opt(a.scale),
        ];
        break;
      case "removeBlock":
        tokens = [
          lit("data"),
          lit("remove"),
          lit("block"),
          A(a.targetPos),
          A(a.path),
        ];
        break;
      case "removeEntity":
        tokens = [
          lit("data"),
          lit("remove"),
          lit("entity"),
          A(a.target),
          A(a.path),
        ];
        break;
      case "removeStorage":
        tokens = [
          lit("data"),
          lit("remove"),
          lit("storage"),
          A(a.target),
          A(a.path),
        ];
        break;
      case "modifyStorageMergeFromEntity":
        tokens = [
          lit("data"),
          lit("modify"),
          lit("storage"),
          A(a.target),
          A(a.targetPath),
          lit("merge"),
          lit("from"),
          lit("entity"),
          A(a.source),
          ...opt(a.sourcePath),
        ];
        break;
      case "modifyEntitySetFromEntity":
        tokens = [
          lit("data"),
          lit("modify"),
          lit("entity"),
          A(a.target),
          A(a.targetPath),
          lit("set"),
          lit("from"),
          lit("entity"),
          A(a.source),
          ...opt(a.sourcePath),
        ];
        break;
      case "modifyEntitySetFromBlock":
        tokens = [
          lit("data"),
          lit("modify"),
          lit("entity"),
          A(a.target),
          A(a.targetPath),
          lit("set"),
          lit("from"),
          lit("block"),
          A(a.source),
          ...opt(a.sourcePath),
        ];
        break;
      case "modifyBlockSetFromEntity":
        tokens = [
          lit("data"),
          lit("modify"),
          lit("block"),
          A(a.targetPos),
          A(a.targetPath),
          lit("set"),
          lit("from"),
          lit("entity"),
          A(a.source),
          ...opt(a.sourcePath),
        ];
        break;
      case "modifyBlockSetValue":
        tokens = [
          lit("data"),
          lit("modify"),
          lit("block"),
          A(a.targetPos),
          A(a.targetPath),
          lit("set"),
          lit("value"),
          A(a.value),
        ];
        break;
      case "mergeEntity":
        tokens = [
          lit("data"),
          lit("merge"),
          lit("entity"),
          A(a.target),
          A(a.value),
        ];
        break;
      case "mergeBlock":
        tokens = [
          lit("data"),
          lit("merge"),
          lit("block"),
          A(a.targetPos),
          A(a.value),
        ];
        break;
      case "mergeStorage":
        tokens = [
          lit("data"),
          lit("merge"),
          lit("storage"),
          A(a.target),
          A(a.value),
        ];
        break;
      default: {
        const _exhaustive: never = a;
        throw new Error(
          `Incomplete \`data\` command: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
    ctx.emit(
      buildTokens(v, tokens),
      commandLine(dataEffect(a, v), { local: dataLocal(a) }),
    );
  }
}
