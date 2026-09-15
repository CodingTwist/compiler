// `ctx.data()` builders, split one level at the first sub-command (get/merge/modify/remove).
import { CommandBuilder } from "../base";
import { Id, Nbt, NbtPath, Pos, warnRawEntityNbt } from "../../values";
import { Selector } from "../../frontend/nodes/selector";
import { DataNode } from "./args";

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
    // Raw NBT keys are tied to one version. The selector doesn't say which entity, so the
    // warning can't suggest a factory.
    warnRawEntityNbt(value);
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
    this.node.args = {
      sub: "modifyStorageMergeFromEntity",
      target,
      targetPath,
      source,
      sourcePath,
    };
  }
  entitySetFromEntity(
    target: Selector,
    targetPath: NbtPath,
    source: Selector,
    sourcePath?: NbtPath,
  ): void {
    this.node.args = {
      sub: "modifyEntitySetFromEntity",
      target,
      targetPath,
      source,
      sourcePath,
    };
  }
  entitySetFromBlock(
    target: Selector,
    targetPath: NbtPath,
    source: Pos,
    sourcePath?: NbtPath,
  ): void {
    this.node.args = {
      sub: "modifyEntitySetFromBlock",
      target,
      targetPath,
      source,
      sourcePath,
    };
  }
  blockSetFromEntity(
    targetPos: Pos,
    targetPath: NbtPath,
    source: Selector,
    sourcePath?: NbtPath,
  ): void {
    this.node.args = {
      sub: "modifyBlockSetFromEntity",
      targetPos,
      targetPath,
      source,
      sourcePath,
    };
  }
  blockSetValue(targetPos: Pos, targetPath: NbtPath, value: Nbt): void {
    this.node.args = {
      sub: "modifyBlockSetValue",
      targetPos,
      targetPath,
      value,
    };
  }
  // ...generator emits the remaining ~93 modify leaves
}
