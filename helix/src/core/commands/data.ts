// HAND-WRITTEN PROTOTYPE of the grouped-builder + per-leaf-union shape.
// (subset: get/remove complete, modify shows 2 representative leaves; the
// generator will emit the full ~100-leaf modify set.)
import { CommandNodeBase } from "../ir/node";
import { CommandHandler, CodegenContext } from "../ir/commandhandler";
import { renderArg, buildTokens, lit, arg, Token } from "../ir/command-builder";
import { FunctionContext } from "../frontend/context";
import { CommandBuilder } from "./base";
import { Id, Nbt, NbtPath, Pos } from "../values";
import { Selector } from "../frontend/nodes/selector";
import { ArgInput } from "../values/value";

// --- Typed node: one union variant per reachable leaf (subset shown) --------
export type DataArgs =
  | { sub: "getBlock"; targetPos: Pos; path?: NbtPath; scale?: number }
  | { sub: "getEntity"; target: Selector; path?: NbtPath; scale?: number }
  | { sub: "getStorage"; target: Id; path?: NbtPath; scale?: number }
  | { sub: "removeBlock"; targetPos: Pos; path: NbtPath }
  | { sub: "removeEntity"; target: Selector; path: NbtPath }
  | { sub: "removeStorage"; target: Id; path: NbtPath }
  | { sub: "modifyStorageMergeFromEntity"; target: Id; targetPath: NbtPath; source: Selector; sourcePath?: NbtPath }
  | { sub: "modifyEntitySetFromEntity"; target: Selector; targetPath: NbtPath; source: Selector; sourcePath?: NbtPath }
  | { sub: "modifyEntitySetFromBlock"; target: Selector; targetPath: NbtPath; source: Pos; sourcePath?: NbtPath }
  | { sub: "modifyBlockSetFromEntity"; targetPos: Pos; targetPath: NbtPath; source: Selector; sourcePath?: NbtPath }
  | { sub: "modifyBlockSetValue"; targetPos: Pos; targetPath: NbtPath; value: Nbt }
  | { sub: "mergeEntity"; target: Selector; value: Nbt }
  | { sub: "mergeBlock"; targetPos: Pos; value: Nbt }
  | { sub: "mergeStorage"; target: Id; value: Nbt };
// ...generator emits the remaining modify leaves

export class DataNode extends CommandNodeBase {
  readonly type = "data";
  args!: DataArgs; // set by a terminal builder method
}

// --- Builders: split one level at the first sub-command ----------------------
export class DataBuilder extends CommandBuilder<DataNode> {
  get(): DataGetBuilder {
    return new DataGetBuilder(this.node);
  }
  remove(): DataRemoveBuilder {
    return new DataRemoveBuilder(this.node);
  }
  modify(): DataModifyBuilder {
    return new DataModifyBuilder(this.node);
  }
  merge(): DataMergeBuilder {
    return new DataMergeBuilder(this.node);
  }
}

export class DataMergeBuilder extends CommandBuilder<DataNode> {
  entity(target: Selector, value: Nbt): void {
    this.node.args = { sub: "mergeEntity", target, value };
  }
  block(targetPos: Pos, value: Nbt): void {
    this.node.args = { sub: "mergeBlock", targetPos, value };
  }
  storage(target: Id, value: Nbt): void {
    this.node.args = { sub: "mergeStorage", target, value };
  }
}

export class DataGetBuilder extends CommandBuilder<DataNode> {
  block(targetPos: Pos, path?: NbtPath, scale?: number): void {
    this.node.args = { sub: "getBlock", targetPos, path, scale };
  }
  entity(target: Selector, path?: NbtPath, scale?: number): void {
    this.node.args = { sub: "getEntity", target, path, scale };
  }
  storage(target: Id, path?: NbtPath, scale?: number): void {
    this.node.args = { sub: "getStorage", target, path, scale };
  }
}

export class DataRemoveBuilder extends CommandBuilder<DataNode> {
  block(targetPos: Pos, path: NbtPath): void {
    this.node.args = { sub: "removeBlock", targetPos, path };
  }
  entity(target: Selector, path: NbtPath): void {
    this.node.args = { sub: "removeEntity", target, path };
  }
  storage(target: Id, path: NbtPath): void {
    this.node.args = { sub: "removeStorage", target, path };
  }
}

export class DataModifyBuilder extends CommandBuilder<DataNode> {
  storageMergeFromEntity(
    target: Id,
    targetPath: NbtPath,
    source: Selector,
    sourcePath?: NbtPath,
  ): void {
    this.node.args = { sub: "modifyStorageMergeFromEntity", target, targetPath, source, sourcePath };
  }
  entitySetFromEntity(
    target: Selector,
    targetPath: NbtPath,
    source: Selector,
    sourcePath?: NbtPath,
  ): void {
    this.node.args = { sub: "modifyEntitySetFromEntity", target, targetPath, source, sourcePath };
  }
  entitySetFromBlock(target: Selector, targetPath: NbtPath, source: Pos, sourcePath?: NbtPath): void {
    this.node.args = { sub: "modifyEntitySetFromBlock", target, targetPath, source, sourcePath };
  }
  blockSetFromEntity(targetPos: Pos, targetPath: NbtPath, source: Selector, sourcePath?: NbtPath): void {
    this.node.args = { sub: "modifyBlockSetFromEntity", targetPos, targetPath, source, sourcePath };
  }
  blockSetValue(targetPos: Pos, targetPath: NbtPath, value: Nbt): void {
    this.node.args = { sub: "modifyBlockSetValue", targetPos, targetPath, value };
  }
  // ...generator emits the remaining ~93 modify leaves
}

// --- Handler: render the chosen leaf's tokens in tree order -----------------
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
        tokens = [lit("data"), lit("get"), lit("block"), A(a.targetPos), ...opt(a.path), ...opt(a.scale)];
        break;
      case "getEntity":
        tokens = [lit("data"), lit("get"), lit("entity"), A(a.target), ...opt(a.path), ...opt(a.scale)];
        break;
      case "getStorage":
        tokens = [lit("data"), lit("get"), lit("storage"), A(a.target), ...opt(a.path), ...opt(a.scale)];
        break;
      case "removeBlock":
        tokens = [lit("data"), lit("remove"), lit("block"), A(a.targetPos), A(a.path)];
        break;
      case "removeEntity":
        tokens = [lit("data"), lit("remove"), lit("entity"), A(a.target), A(a.path)];
        break;
      case "removeStorage":
        tokens = [lit("data"), lit("remove"), lit("storage"), A(a.target), A(a.path)];
        break;
      case "modifyStorageMergeFromEntity":
        tokens = [lit("data"), lit("modify"), lit("storage"), A(a.target), A(a.targetPath), lit("merge"), lit("from"), lit("entity"), A(a.source), ...opt(a.sourcePath)];
        break;
      case "modifyEntitySetFromEntity":
        tokens = [lit("data"), lit("modify"), lit("entity"), A(a.target), A(a.targetPath), lit("set"), lit("from"), lit("entity"), A(a.source), ...opt(a.sourcePath)];
        break;
      case "modifyEntitySetFromBlock":
        tokens = [lit("data"), lit("modify"), lit("entity"), A(a.target), A(a.targetPath), lit("set"), lit("from"), lit("block"), A(a.source), ...opt(a.sourcePath)];
        break;
      case "modifyBlockSetFromEntity":
        tokens = [lit("data"), lit("modify"), lit("block"), A(a.targetPos), A(a.targetPath), lit("set"), lit("from"), lit("entity"), A(a.source), ...opt(a.sourcePath)];
        break;
      case "modifyBlockSetValue":
        tokens = [lit("data"), lit("modify"), lit("block"), A(a.targetPos), A(a.targetPath), lit("set"), lit("value"), A(a.value)];
        break;
      case "mergeEntity":
        tokens = [lit("data"), lit("merge"), lit("entity"), A(a.target), A(a.value)];
        break;
      case "mergeBlock":
        tokens = [lit("data"), lit("merge"), lit("block"), A(a.targetPos), A(a.value)];
        break;
      case "mergeStorage":
        tokens = [lit("data"), lit("merge"), lit("storage"), A(a.target), A(a.value)];
        break;
      default: {
        const _exhaustive: never = a;
        throw new Error(`Incomplete \`data\` command: ${JSON.stringify(_exhaustive)}`);
      }
    }
    ctx.emit(buildTokens(v, tokens));
  }
}

declare module "../frontend/context" {
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
