// The clause vocabulary of an `execute` chain and the node that holds one.
import { ASTNode, FunctionNode, Range } from "../../ir/node";
import { Score } from "../../frontend/nodes/score";
import { Selector } from "../../frontend/nodes/selector";
import { Block, EntityAnchor, Id, ItemSlot, NbtPath, Pos, Relation, Swizzle } from "../../values";
import { ItemValue } from "../../values/item";
import { PredicateRef } from "../../values/predicate";
// Type-only: erased at runtime, so it can't form the import cycle a value import would.
import type { FunctionRef } from "../../function_ref";

/** `if` or `unless` for a guard clause. */
export type Cond = "if" | "unless";
/** `result` (the value) or `success` (1/0) for a `store` clause. */
export type StoreMode = "result" | "success";
/** SNBT numeric type a `store … storage` write coerces to. */
export type StoreNumType = "byte" | "short" | "int" | "long" | "float" | "double";
/** A registered predicate, an {@link Id}, or a raw id string. */
export type PredicateLike = PredicateRef | Id | string;
/** Which number of a bossbar a `store … bossbar` clause writes. */
export type BossbarField = "value" | "max";

/** One sub-command of an `execute` chain (context shift, store, or guard). */
export type Clause =
  | { k: "as"; sel: Selector }
  | { k: "at"; sel: Selector }
  | { k: "in"; dim: Id }
  | { k: "positioned"; pos: Pos }
  | { k: "positionedAs"; sel: Selector }
  | { k: "rotated"; rot: Pos }
  | { k: "rotatedAs"; sel: Selector }
  | { k: "facing"; pos: Pos }
  | { k: "facingEntity"; sel: Selector; anchor: EntityAnchor }
  | { k: "anchored"; anchor: EntityAnchor }
  | { k: "on"; relation: Relation }
  | { k: "align"; axes: Swizzle }
  | { k: "scoreMatches"; mode: Cond; score: Score; range: Range }
  | { k: "scoreCompare"; mode: Cond; a: Score; op: "<" | "<=" | "=" | ">=" | ">"; b: Score }
  | { k: "entity"; mode: Cond; sel: Selector }
  | { k: "items"; mode: Cond; sel: Selector; slot: ItemSlot; item: ItemValue }
  | { k: "block"; mode: Cond; pos: Pos; block: Block }
  | { k: "predicate"; mode: Cond; id: string }
  | { k: "callFunction"; mode: Cond; fn: FunctionRef }
  | { k: "storeScore"; mode: StoreMode; score: Score }
  | { k: "storeEntity"; mode: StoreMode; sel: Selector; path: NbtPath; type: StoreNumType; scale: number }
  | { k: "storeStorage"; mode: StoreMode; id: Id; path: NbtPath; type: StoreNumType; scale: number }
  | { k: "storeBossbar"; mode: StoreMode; id: Id; field: BossbarField };

export class ExecuteNode extends ASTNode {
  readonly type = "execute";
  clauses: Clause[] = [];
  /** The body spliced into the terminal `run` clause (built by `ExecuteBuilder.run`). */
  runBody?: FunctionNode;
}
