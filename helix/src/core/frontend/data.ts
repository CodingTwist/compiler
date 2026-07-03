// The code-first `data` facade: model storages/entities/blocks as NBT holders
// you read and write, instead of mirroring the `data ...` command grammar.
//
//   const state = ctx.storage("example:state");
//   state.set("players", ctx.entity(Selector.self()).at("SelectedItem"));
//   state.get("players");
//
import { DataOpNode, DataSourceSpec, ModifyAction, NbtTargetSpec } from "../commands/data_op";
import { CommandValue, toCommandValue } from "../values/value";
import { Id, Nbt, NbtPath, Pos } from "../values";
import { Selector } from "./nodes/selector";
import { NbtRef } from "./nodes/nbt_ref";
import { FunctionContext } from "./context";

export { NbtRef };

const opt = (x: NbtPath | undefined): CommandValue | undefined =>
  x !== undefined ? toCommandValue(x) : undefined;

/** A copy/modify source: a literal value, or a reference to other NBT. */
export type DataSource = Nbt | NbtRef | DataSourceSpec;

function toSource(s: DataSource): DataSourceSpec {
  if (s instanceof NbtRef) return { via: "from", target: s.target, path: s.path };
  if (typeof s === "object" && s !== null && "via" in s) return s;
  return { via: "value", value: toCommandValue(s) };
}

/**
 * A storage / entity / block you operate on with NBT verbs. Each verb emits a
 * `data` command into the function the holder was created from.
 */
export class NbtHolder {
  constructor(
    private readonly ctx: FunctionContext,
    private readonly target: NbtTargetSpec,
  ) {}

  /** A reference into this holder, for use as a copy source. */
  at(path?: NbtPath): NbtRef {
    return new NbtRef(this.target, opt(path));
  }

  /** `data get` - read a value (optionally scaled). */
  get(path?: NbtPath, scale?: number): void {
    this.ctx.emit(new DataOpNode({ op: "get", target: this.target, path: opt(path), scale }));
  }

  /** `data remove` - delete the value at a path. */
  remove(path: NbtPath): void {
    this.ctx.emit(new DataOpNode({ op: "remove", target: this.target, path: toCommandValue(path) }));
  }

  /** `data merge` - merge a compound into the whole holder. */
  mergeAll(value: Nbt): void {
    this.ctx.emit(new DataOpNode({ op: "mergeAll", target: this.target, value: toCommandValue(value) }));
  }

  /** `data modify … set` */
  set(path: NbtPath, source: DataSource): void {
    this.modify("set", path, source);
  }
  /** `data modify … merge` */
  merge(path: NbtPath, source: DataSource): void {
    this.modify("merge", path, source);
  }
  /** `data modify … append` */
  append(path: NbtPath, source: DataSource): void {
    this.modify("append", path, source);
  }
  /** `data modify … prepend` */
  prepend(path: NbtPath, source: DataSource): void {
    this.modify("prepend", path, source);
  }
  /** `data modify … insert <index>` */
  insert(index: number, path: NbtPath, source: DataSource): void {
    this.modify("insert", path, source, index);
  }

  private modify(action: ModifyAction, path: NbtPath, source: DataSource, index?: number): void {
    this.ctx.emit(
      new DataOpNode({
        op: "modify",
        action,
        index,
        target: this.target,
        path: toCommandValue(path),
        source: toSource(source),
      }),
    );
  }
}

declare module "./context" {
  interface FunctionContext {
    /** Command storage as an NBT holder: `ctx.storage(Id("ns:id")).set(...)`. */
    storage(id: Id): NbtHolder;
    /** An entity's NBT as a holder: `ctx.entity(Selector.self()).get("Health")`. */
    entity(target: Selector): NbtHolder;
    /** A block's NBT as a holder: `ctx.block(Pos.here()).remove("Items[0]")`. */
    block(pos: Pos): NbtHolder;
  }
}

FunctionContext.prototype.storage = function (this: FunctionContext, id: Id) {
  return new NbtHolder(this, { kind: "storage", locator: toCommandValue(id) });
};
FunctionContext.prototype.entity = function (this: FunctionContext, target: Selector) {
  return new NbtHolder(this, { kind: "entity", locator: toCommandValue(target) });
};
FunctionContext.prototype.block = function (this: FunctionContext, pos: Pos) {
  return new NbtHolder(this, { kind: "block", locator: toCommandValue(pos) });
};
