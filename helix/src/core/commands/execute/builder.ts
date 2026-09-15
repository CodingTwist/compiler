// `ctx.execute()`'s chain builder: guards, stores and the terminal `run`.
import { Range } from "../../ir/node";
import { FunctionContext } from "../../frontend/context";
import { runInContext } from "../../frontend/context/ambient";
import { Score } from "../../frontend/nodes/score";
import { Selector } from "../../frontend/nodes/selector";
import { Block, Id, ItemSlot, NbtPath, Pos } from "../../values";
import { ItemValue } from "../../values/item";
import { PredicateRef } from "../../values/predicate";
// Type-only: erased at runtime, so it can't form the import cycle a value import would.
import type { FunctionRef } from "../../function_ref";
import { ExecuteShifts } from "./shifts";
import type { BossbarField, PredicateLike, StoreNumType } from "./types";

function predicateId(ref: PredicateLike): string {
  return ref instanceof PredicateRef
    ? ref.id
    : typeof ref === "string"
      ? Id(ref).render()
      : ref.render();
}

/**
 * Builder for {@link ExecuteNode}. Each method adds a clause; {@link run} ends the chain.
 */
export class ExecuteBuilder extends ExecuteShifts {
  ifScoreMatches(score: Score, range: Range): this {
    return this.push({ k: "scoreMatches", mode: "if", score, range });
  }
  unlessScoreMatches(score: Score, range: Range): this {
    return this.push({ k: "scoreMatches", mode: "unless", score, range });
  }
  ifScore(a: Score, op: "<" | "<=" | "=" | ">=" | ">", b: Score): this {
    return this.push({ k: "scoreCompare", mode: "if", a, op, b });
  }
  unlessScore(a: Score, op: "<" | "<=" | "=" | ">=" | ">", b: Score): this {
    return this.push({ k: "scoreCompare", mode: "unless", a, op, b });
  }
  ifEntity(sel: Selector): this {
    return this.push({ k: "entity", mode: "if", sel });
  }
  unlessEntity(sel: Selector): this {
    return this.push({ k: "entity", mode: "unless", sel });
  }
  /**
   * `if function <fn>`: runs `fn` and passes if it returns non-zero.
   * Note this calls the function.
   */
  ifFunction(fn: FunctionRef): this {
    return this.push({ k: "callFunction", mode: "if", fn });
  }
  unlessFunction(fn: FunctionRef): this {
    return this.push({ k: "callFunction", mode: "unless", fn });
  }
  /**
   * `if items entity <sel> <slot> <item>`: tests one specific inventory slot.
   * The item predicate is built from the same {@link ItemValue} you give, so components
   * match exactly.
   */
  ifItems(sel: Selector, slot: ItemSlot, item: ItemValue): this {
    return this.push({ k: "items", mode: "if", sel, slot, item });
  }
  unlessItems(sel: Selector, slot: ItemSlot, item: ItemValue): this {
    return this.push({ k: "items", mode: "unless", sel, slot, item });
  }
  /** `if block <pos> <block>` - true when the block at `pos` matches (id, state, or `#tag`). */
  ifBlock(pos: Pos, block: Block): this {
    return this.push({ k: "block", mode: "if", pos, block });
  }
  unlessBlock(pos: Pos, block: Block): this {
    return this.push({ k: "block", mode: "unless", pos, block });
  }
  ifPredicate(ref: PredicateLike): this {
    return this.push({ k: "predicate", mode: "if", id: predicateId(ref) });
  }
  unlessPredicate(ref: PredicateLike): this {
    return this.push({ k: "predicate", mode: "unless", id: predicateId(ref) });
  }
  storeResultScore(score: Score): this {
    return this.push({ k: "storeScore", mode: "result", score });
  }
  storeSuccessScore(score: Score): this {
    return this.push({ k: "storeScore", mode: "success", score });
  }
  /**
   * `store <result|success> entity <sel> <path> <type> <scale>`: writes straight into
   * entity NBT.
   * `scale` turns an integer score into the fractional value the field needs.
   */
  storeResultEntity(
    sel: Selector,
    path: NbtPath,
    type: StoreNumType,
    scale: number,
  ): this {
    return this.push({
      k: "storeEntity",
      mode: "result",
      sel,
      path,
      type,
      scale,
    });
  }
  storeSuccessEntity(
    sel: Selector,
    path: NbtPath,
    type: StoreNumType,
    scale: number,
  ): this {
    return this.push({
      k: "storeEntity",
      mode: "success",
      sel,
      path,
      type,
      scale,
    });
  }
  storeResultStorage(
    id: Id,
    path: NbtPath,
    type: StoreNumType,
    scale: number,
  ): this {
    return this.push({
      k: "storeStorage",
      mode: "result",
      id,
      path,
      type,
      scale,
    });
  }
  storeSuccessStorage(
    id: Id,
    path: NbtPath,
    type: StoreNumType,
    scale: number,
  ): this {
    return this.push({
      k: "storeStorage",
      mode: "success",
      id,
      path,
      type,
      scale,
    });
  }
  /**
   * `store <result|success> bossbar <id> <value|max>`. The only way to drive a bar from a
   * runtime value.
   */
  storeResultBossbar(id: Id, field: BossbarField): this {
    return this.push({ k: "storeBossbar", mode: "result", id, field });
  }
  storeSuccessBossbar(id: Id, field: BossbarField): this {
    return this.push({ k: "storeBossbar", mode: "success", id, field });
  }

  /**
   * Ends the chain with no `run`; the conditions are the command.
   *
   * E.g. `execute store result score <s> if entity <sel>` counts matches; a `run` would
   * change the count.
   */
  done(): void {}

  /** Ends the chain with `run <body>`. One command inlines; more go in a child function. */
  run(build: (ctx: FunctionContext) => void): void {
    const body = this.ctx.createChildFunction("exec");
    runInContext(new FunctionContext(body, this.ctx.version), build);
    this.node.runBody = body;
  }

  /**
   * {@link run}, or if no clauses were added, emits `build` directly instead of `execute
   * run …`.
   */
  runOrInline(build: (ctx: FunctionContext) => void): void {
    if (this.clauseCount > 0) return this.run(build);
    this.ctx.retract(this.node);
    build(this.ctx);
  }
}
