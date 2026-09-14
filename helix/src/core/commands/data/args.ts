// The `data` node: one union variant per reachable leaf (a hand-written subset).
import { CommandNodeBase } from "../../ir/node";
import { Id, Nbt, NbtPath, Pos } from "../../values";
import { Selector } from "../../frontend/nodes/selector";

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
