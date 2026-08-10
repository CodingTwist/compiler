// HAND-WRITTEN. A general, typed `execute` chain builder.
//
// The other execute-family handlers (`execute_as`, `at_entity`, `execute_store`,
// the `if` chain, the entity/near guards) each model one narrow shape. Some packs
// need the full grammar: several `as/at/in/positioned/rotated` context shifts, one
// or more `store result/success`, any number of `if/unless` guards, then a single
// `run`. This builder composes those clauses in author order and renders them as
// one `execute … run <command>` line.
//
// Per the repo rule, every domain value in a clause (selector, position, score,
// id, path, range, predicate) is rendered through its typed class - only the
// execute *keywords* (`as`, `if`, `store`, `run`, …) are literals. The leading
// `execute` is tree-validated; the clause tail rides as `raw` exactly like the
// existing `if`/`at_entity` handlers (the validator can't follow execute's
// argument-redirects past the first sub-command anyway). Registered via
// EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
import { ASTNode, FunctionNode, Range } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { generateRunTarget } from "../ir/generate";
import { buildTokens, lit, raw } from "../ir/command-builder";
import { VersionProfile } from "../../versions/profile";
import { FunctionContext } from "../frontend/context";
import { runInContext } from "../frontend/context/ambient";
import { Score } from "../frontend/nodes/score";
import { Selector } from "../frontend/nodes/selector";
import { Block, EntityAnchor, Id, ItemSlot, NbtPath, Pos, Relation, Swizzle } from "../values";
import { ItemValue } from "../values/item";
import { toCommandValue } from "../values/value";
import { PredicateRef } from "../values/predicate";
// Type-only: erased at runtime, so it can't form the import cycle a value import would.
import type { FunctionRef } from "../function_ref";

/** `if` or `unless` for a guard clause. */
type Cond = "if" | "unless";
/** `result` (the value) or `success` (1/0) for a `store` clause. */
type StoreMode = "result" | "success";
/** SNBT numeric type a `store … storage` write coerces to. */
export type StoreNumType = "byte" | "short" | "int" | "long" | "float" | "double";
/** A registered predicate, an {@link Id}, or a raw id string. */
type PredicateLike = PredicateRef | Id | string;

/** One sub-command of an `execute` chain (context shift, store, or guard). */
type Clause =
  | { k: "as"; sel: Selector }
  | { k: "at"; sel: Selector }
  | { k: "in"; dim: Id }
  | { k: "positioned"; pos: Pos }
  | { k: "positionedAs"; sel: Selector }
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
  | {
      k: "storeEntity";
      mode: StoreMode;
      sel: Selector;
      path: NbtPath;
      type: StoreNumType;
      scale: number;
    }
  | {
      k: "storeStorage";
      mode: StoreMode;
      id: Id;
      path: NbtPath;
      type: StoreNumType;
      scale: number;
    };

export class ExecuteNode extends ASTNode {
  readonly type = "execute";
  clauses: Clause[] = [];
  /** The body spliced into the terminal `run` clause (built by {@link ExecuteBuilder.run}). */
  runBody?: FunctionNode;
}

function predicateId(ref: PredicateLike): string {
  return ref instanceof PredicateRef
    ? ref.id
    : typeof ref === "string"
      ? Id(ref).render()
      : ref.render();
}

/**
 * Fluent builder for {@link ExecuteNode}. Each method appends one clause (in call
 * order); the chain is terminated by {@link run}, which captures the run body.
 */
export class ExecuteBuilder {
  constructor(
    private readonly ctx: FunctionContext,
    private readonly node: ExecuteNode,
  ) {}

  /**
   * How many clauses have been appended so far. Lets a caller that *composes*
   * chains (see `Detect`) tell "no conditions at all" from "some", and skip
   * emitting a bare `execute run <cmd>` in the former case.
   */
  get clauseCount(): number {
    return this.node.clauses.length;
  }

  as(sel: Selector): this {
    this.node.clauses.push({ k: "as", sel });
    return this;
  }
  at(sel: Selector): this {
    this.node.clauses.push({ k: "at", sel });
    return this;
  }
  in(dim: Id): this {
    this.node.clauses.push({ k: "in", dim });
    return this;
  }
  positioned(pos: Pos): this {
    this.node.clauses.push({ k: "positioned", pos });
    return this;
  }
  positionedAs(sel: Selector): this {
    this.node.clauses.push({ k: "positionedAs", sel });
    return this;
  }
  rotatedAs(sel: Selector): this {
    this.node.clauses.push({ k: "rotatedAs", sel });
    return this;
  }
  /** `facing <pos>` - rotate so `^`-local coords aim at `pos`. */
  facing(pos: Pos): this {
    this.node.clauses.push({ k: "facing", pos });
    return this;
  }
  /** `facing entity <sel> eyes|feet` - rotate so `^`-local coords aim at the entity. */
  facingEntity(sel: Selector, anchor: EntityAnchor = EntityAnchor.FEET): this {
    this.node.clauses.push({ k: "facingEntity", sel, anchor });
    return this;
  }
  /** `anchored eyes|feet` - which point on the executor `^`-local coords pivot on. */
  anchored(anchor: EntityAnchor): this {
    this.node.clauses.push({ k: "anchored", anchor });
    return this;
  }
  /**
   * `on <relation>` - become an entity related to the current executor (its
   * {@link Relation.TARGET}, vehicle, owner, …). Position is *not* moved, only the
   * executor. If there is no such entity the chain silently does nothing, which makes
   * `on target` both the "is this mob actually fighting?" test and the way to get at who.
   */
  on(relation: Relation): this {
    this.node.clauses.push({ k: "on", relation });
    return this;
  }
  ifScoreMatches(score: Score, range: Range): this {
    this.node.clauses.push({ k: "scoreMatches", mode: "if", score, range });
    return this;
  }
  unlessScoreMatches(score: Score, range: Range): this {
    this.node.clauses.push({ k: "scoreMatches", mode: "unless", score, range });
    return this;
  }
  ifScore(a: Score, op: "<" | "<=" | "=" | ">=" | ">", b: Score): this {
    this.node.clauses.push({ k: "scoreCompare", mode: "if", a, op, b });
    return this;
  }
  unlessScore(a: Score, op: "<" | "<=" | "=" | ">=" | ">", b: Score): this {
    this.node.clauses.push({ k: "scoreCompare", mode: "unless", a, op, b });
    return this;
  }
  ifEntity(sel: Selector): this {
    this.node.clauses.push({ k: "entity", mode: "if", sel });
    return this;
  }
  unlessEntity(sel: Selector): this {
    this.node.clauses.push({ k: "entity", mode: "unless", sel });
    return this;
  }
  /**
   * `if function <fn>` - run `fn` and branch on what it **returns** (`return <n>`):
   * non-zero passes, `0` and `return fail` do not. The composable way to consume a
   * function's result, as opposed to parking it in a score first.
   *
   * Note it *executes* the function to find out - this is a call, not a lookup.
   */
  ifFunction(fn: FunctionRef): this {
    this.node.clauses.push({ k: "callFunction", mode: "if", fn });
    return this;
  }
  unlessFunction(fn: FunctionRef): this {
    this.node.clauses.push({ k: "callFunction", mode: "unless", fn });
    return this;
  }
  /** `align <axes>` - snap the position to the block grid on those axes (e.g. "xyz"). */
  align(axes: Swizzle): this {
    this.node.clauses.push({ k: "align", axes });
    return this;
  }
  /**
   * `if items entity <sel> <slot> <item_predicate>` - the only vanilla way to
   * test one *specific* inventory slot's contents (equipment predicates cover
   * just the 6 worn slots). `item` is matched as an item predicate built from
   * the same {@link ItemValue} you'd `give`, so the check sees the exact
   * components (name/lore/model) the item was granted with.
   */
  ifItems(sel: Selector, slot: ItemSlot, item: ItemValue): this {
    this.node.clauses.push({ k: "items", mode: "if", sel, slot, item });
    return this;
  }
  unlessItems(sel: Selector, slot: ItemSlot, item: ItemValue): this {
    this.node.clauses.push({ k: "items", mode: "unless", sel, slot, item });
    return this;
  }
  /** `if block <pos> <block>` - true when the block at `pos` matches (id, state, or `#tag`). */
  ifBlock(pos: Pos, block: Block): this {
    this.node.clauses.push({ k: "block", mode: "if", pos, block });
    return this;
  }
  unlessBlock(pos: Pos, block: Block): this {
    this.node.clauses.push({ k: "block", mode: "unless", pos, block });
    return this;
  }
  ifPredicate(ref: PredicateLike): this {
    this.node.clauses.push({ k: "predicate", mode: "if", id: predicateId(ref) });
    return this;
  }
  unlessPredicate(ref: PredicateLike): this {
    this.node.clauses.push({ k: "predicate", mode: "unless", id: predicateId(ref) });
    return this;
  }
  storeResultScore(score: Score): this {
    this.node.clauses.push({ k: "storeScore", mode: "result", score });
    return this;
  }
  storeSuccessScore(score: Score): this {
    this.node.clauses.push({ k: "storeScore", mode: "success", score });
    return this;
  }
  /**
   * `store <result|success> entity <sel> <path> <type> <scale>` - write the value
   * straight into an entity's NBT. The direct route for score-computed `Motion` /
   * `Rotation` / attribute values: no storage round-trip, and the `scale` turns an
   * integer score into the fractional double the field wants.
   */
  storeResultEntity(sel: Selector, path: NbtPath, type: StoreNumType, scale: number): this {
    this.node.clauses.push({ k: "storeEntity", mode: "result", sel, path, type, scale });
    return this;
  }
  storeSuccessEntity(sel: Selector, path: NbtPath, type: StoreNumType, scale: number): this {
    this.node.clauses.push({ k: "storeEntity", mode: "success", sel, path, type, scale });
    return this;
  }
  storeResultStorage(id: Id, path: NbtPath, type: StoreNumType, scale: number): this {
    this.node.clauses.push({ k: "storeStorage", mode: "result", id, path, type, scale });
    return this;
  }
  storeSuccessStorage(id: Id, path: NbtPath, type: StoreNumType, scale: number): this {
    this.node.clauses.push({ k: "storeStorage", mode: "success", id, path, type, scale });
    return this;
  }

  /**
   * Terminate the chain with **no** `run` - the conditions themselves are the
   * command. `execute store result score <s> if entity <sel>` stores how many
   * entities matched; there is nothing to run, and adding a `run` would change
   * what is counted.
   *
   * Purely declarative (the node is already emitted), but stating it is what
   * separates "this chain is finished" from a chain whose `run` was forgotten.
   */
  done(): void {}

  /**
   * Terminate the chain with `run <body>`. The body is captured into a child
   * function; a single-command body inlines into the `run` clause (no file), a
   * multi-command one commits to its own function - exactly like `if`/`atEntity`.
   */
  run(build: (ctx: FunctionContext) => void): void {
    const body = this.ctx.createChildFunction("exec");
    runInContext(new FunctionContext(body, this.ctx.version), build);
    this.node.runBody = body;
  }

  /**
   * {@link run}, unless no clauses were ever appended - in which case the chain
   * withdraws itself and `build` is emitted where it would have been.
   *
   * For chains assembled from *composed* conditions (see `Detect`), where "no
   * condition at all" is a legitimate composition and `execute run <cmd>` would
   * be a vacuous wrapper around it.
   */
  runOrInline(build: (ctx: FunctionContext) => void): void {
    if (this.clauseCount > 0) return this.run(build);
    this.ctx.retract(this.node);
    build(this.ctx);
  }
}

export class ExecuteHandler extends CommandHandler<ExecuteNode> {
  readonly type: ExecuteNode["type"] = "execute";

  generate(node: ExecuteNode, ctx: CodegenContext): void {
    const v = ctx.version;
    const parts = node.clauses.map((c) => this.clause(c, v, ctx.datapack.name));
    if (node.runBody) {
      const cmd = generateRunTarget(node.runBody, ctx.datapack, ctx.dispatcher);
      parts.push(`run ${cmd}`);
    }
    ctx.emit(buildTokens(v, [lit("execute"), raw(parts.join(" "))]));
  }

  private score(s: Score, v: VersionProfile): string {
    return `${toCommandValue(s.target).render(v)} ${s.objective.objective}`;
  }

  private clause(c: Clause, v: VersionProfile, ns: string): string {
    switch (c.k) {
      case "as":
        return `as ${toCommandValue(c.sel).render(v)}`;
      case "at":
        return `at ${toCommandValue(c.sel).render(v)}`;
      case "in":
        return `in ${c.dim.render()}`;
      case "positioned":
        return `positioned ${toCommandValue(c.pos).render(v)}`;
      case "positionedAs":
        return `positioned as ${toCommandValue(c.sel).render(v)}`;
      case "rotatedAs":
        return `rotated as ${toCommandValue(c.sel).render(v)}`;
      case "facing":
        return `facing ${toCommandValue(c.pos).render(v)}`;
      case "facingEntity":
        return `facing entity ${toCommandValue(c.sel).render(v)} ${c.anchor}`;
      case "anchored":
        return `anchored ${c.anchor}`;
      case "on":
        return `on ${c.relation}`;
      case "align":
        return `align ${c.axes}`;
      case "scoreMatches":
        return `${c.mode} score ${this.score(c.score, v)} matches ${c.range}`;
      case "scoreCompare":
        return `${c.mode} score ${this.score(c.a, v)} ${c.op} ${this.score(c.b, v)}`;
      case "entity":
        return `${c.mode} entity ${toCommandValue(c.sel).render(v)}`;
      case "items":
        return `${c.mode} items entity ${toCommandValue(c.sel).render(v)} ${c.slot} ${c.item.render(v)}`;
      case "block":
        return `${c.mode} block ${toCommandValue(c.pos).render(v)} ${c.block.render(v)}`;
      case "predicate":
        return `${c.mode} predicate ${c.id}`;
      case "callFunction":
        return `${c.mode} function ${ns}:${c.fn.getName()}`;
      case "storeScore":
        return `store ${c.mode} score ${this.score(c.score, v)}`;
      case "storeEntity":
        return `store ${c.mode} entity ${toCommandValue(c.sel).render(v)} ${c.path.render()} ${c.type} ${c.scale}`;
      case "storeStorage":
        return `store ${c.mode} storage ${c.id.render()} ${c.path.render()} ${c.type} ${c.scale}`;
    }
  }
}

// ---------------------------------------------------------------------------
// `return run <command>` - the `return` command's run form. The generated
// `return.ts` only models `return` / `return <value>` / `return fail`; this adds
// the variant that runs a command and returns its result, used both standalone
// and as an `execute … run return run …` terminal.
// ---------------------------------------------------------------------------

export class ReturnRunNode extends ASTNode {
  readonly type = "return_run";
  runBody?: FunctionNode;
}

export class ReturnRunHandler extends CommandHandler<ReturnRunNode> {
  readonly type: ReturnRunNode["type"] = "return_run";

  generate(node: ReturnRunNode, ctx: CodegenContext): void {
    if (!node.runBody) throw new Error("returnRun() body was never built");
    const cmd = generateRunTarget(node.runBody, ctx.datapack, ctx.dispatcher);
    ctx.emit(buildTokens(ctx.version, [lit("return"), raw(`run ${cmd}`)]));
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** A general `execute … run …` chain. See {@link ExecuteBuilder}. */
    execute(): ExecuteBuilder;
    /**
     * Run the commands emitted in `build` anchored at `selector`'s position with
     * one `execute at <selector> [align <axes>] run …`. A single command inlines
     * into the `run` clause; multiple commands commit to one child function and
     * the wrapper runs `… run function <child>` - so the selector is evaluated
     * **once**, not re-scanned per command (important when it's an expensive
     * `@a[…,nbt={…}]` filter). Pass `align` (e.g. "xyz") to snap the anchor to the
     * block grid first - needed when block ops (fill/place) ride an entity at a
     * fractional position.
     */
    atEntity(
      selector: Selector,
      build: (ctx: FunctionContext) => void,
      align?: Swizzle,
    ): void;
    /**
     * Run the commands emitted in `build` only when `target`'s `slot` holds an
     * item matching `item` (`mode` defaults to `"if"`). See
     * {@link ExecuteBuilder.ifItems}.
     */
    whenItems(
      target: Selector,
      slot: ItemSlot,
      item: ItemValue,
      build: (ctx: FunctionContext) => void,
      mode?: Cond,
    ): void;
    /** `return run <command>` - return the result of running `build`'s command. */
    returnRun(build: (ctx: FunctionContext) => void): void;
  }
}

FunctionContext.prototype.execute = function (this: FunctionContext): ExecuteBuilder {
  const node = new ExecuteNode();
  this.emit(node);
  return new ExecuteBuilder(this, node);
};

FunctionContext.prototype.returnRun = function (
  this: FunctionContext,
  build: (ctx: FunctionContext) => void,
): void {
  const node = new ReturnRunNode();
  this.emit(node);
  const body = this.createChildFunction("return");
  runInContext(new FunctionContext(body, this.version), build);
  node.runBody = body;
};

FunctionContext.prototype.atEntity = function (
  this: FunctionContext,
  selector: Selector,
  build: (ctx: FunctionContext) => void,
  align?: Swizzle,
): void {
  const chain = this.execute().at(selector);
  if (align) chain.align(align);
  chain.run(build);
};

FunctionContext.prototype.whenItems = function (
  this: FunctionContext,
  target: Selector,
  slot: ItemSlot,
  item: ItemValue,
  build: (ctx: FunctionContext) => void,
  mode: Cond = "if",
): void {
  const chain = this.execute();
  (mode === "if" ? chain.ifItems : chain.unlessItems).call(chain, target, slot, item);
  chain.run(build);
};
