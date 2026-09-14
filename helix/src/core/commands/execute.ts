// HAND-WRITTEN. A general typed `execute` chain builder.
//
// Composes context shifts, stores and `if/unless` guards in author order, then one `run`.
// Values render through their typed classes; only keywords are literal. Everything after
// the
// leading `execute` is `raw`, because the validator can't follow execute's redirects.
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
import { ASTNode, FunctionNode, Range } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { generateRunTargetLine, runClause } from "../ir/generate";
import {
  chainLine,
  entityWriteEffect,
  pureClause,
  selectorClause,
  worst,
  Effect,
  type SharedClause,
} from "../ir/line-info";
import { buildTokens, lit, raw } from "../ir/command-builder";
import { VersionProfile } from "../../versions/profile";
import { FunctionContext } from "../frontend/context";
import { runInContext } from "../frontend/context/ambient";
import { renderExistence } from "./selector";
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
    }
  | { k: "storeBossbar"; mode: StoreMode; id: Id; field: BossbarField };

/** Which number of a bossbar a `store … bossbar` clause writes. */
export type BossbarField = "value" | "max";

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
 * Builder for {@link ExecuteNode}. Each method adds a clause; {@link run} ends the chain.
 */
export class ExecuteBuilder {
  constructor(
    private readonly ctx: FunctionContext,
    private readonly node: ExecuteNode,
  ) {}

  /**
   * Number of clauses added so far, so composed chains can tell "no conditions" from
   * "some".
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
  /** `rotated <yaw> <pitch>` - e.g. `Pos.rel(0, Pos.abs(0))` keeps yaw, levels pitch. */
  rotated(rot: Pos): this {
    this.node.clauses.push({ k: "rotated", rot });
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
   * `on <relation>`: switch the executor to a related entity (target, vehicle, owner…)
   * without moving.
   *
   * If there's no such entity the chain does nothing, so `on target` also tests "is it
   * fighting?".
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
   * `if function <fn>`: runs `fn` and passes if it returns non-zero.
   * Note this calls the function.
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
   * `if items entity <sel> <slot> <item>`: tests one specific inventory slot.
   * The item predicate is built from the same {@link ItemValue} you give, so components
   * match exactly.
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
   * `store <result|success> entity <sel> <path> <type> <scale>`: writes straight into
   * entity NBT.
   * `scale` turns an integer score into the fractional value the field needs.
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
   * `store <result|success> bossbar <id> <value|max>`. The only way to drive a bar from a
   * runtime value.
   */
  storeResultBossbar(id: Id, field: BossbarField): this {
    this.node.clauses.push({ k: "storeBossbar", mode: "result", id, field });
    return this;
  }
  storeSuccessBossbar(id: Id, field: BossbarField): this {
    this.node.clauses.push({ k: "storeBossbar", mode: "success", id, field });
    return this;
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

export class ExecuteHandler extends CommandHandler<ExecuteNode> {
  readonly type: ExecuteNode["type"] = "execute";

  generate(node: ExecuteNode, ctx: CodegenContext): void {
    const v = ctx.version;
    // A bare chain's result can be a count, so only chains that `run` may limit entity
    // tests to one.
    const existence = !!node.runBody;
    const parts = node.clauses.map((c) => this.clause(c, v, ctx.datapack.name, existence));
    const shared = node.clauses.map((c, i) => this.shared(c, parts[i]));
    const own = worst(...node.clauses.map((c) => this.effect(c)));
    const calls = node.clauses.flatMap((c) => (c.k === "callFunction" ? [c.fn.getName()] : []));
    let body;
    if (node.runBody) {
      // An empty body is a no-op unless a `store` clause reads its result.
      const keepEmpty = node.clauses.some((c) => c.k.startsWith("store"));
      const target = generateRunTargetLine(node.runBody, ctx.datapack, ctx.dispatcher, { keepEmpty });
      if (!target.cmd) return;
      parts.push(runClause(target.cmd));
      body = target.info;
    }
    ctx.emit(buildTokens(v, [lit("execute"), raw(parts.join(" "))]), chainLine(shared, body, own, calls));
  }

  /** `c` as a clause other lines may share, given its rendered `text`. */
  private shared(c: Clause, text: string): SharedClause | undefined {
    switch (c.k) {
      case "as":
      case "at":
      case "positionedAs":
      case "rotatedAs":
      case "facingEntity":
        return selectorClause(text, c.sel.build(), c.k === "as");
      case "on":
        // Only a move, dismount or kill changes who rides `@s`.
        return c.relation === Relation.PASSENGERS
          ? { text, kind: "self", scans: false, forks: true }
          : { text, kind: "other", scans: false, forks: false };
      case "in":
      case "positioned":
      case "rotated":
      case "facing":
      case "anchored":
      case "align":
        return pureClause(text);
      // Conditions and stores belong to their own line. No `default`, so a new clause kind
      // must be decided here.
      case "scoreMatches":
      case "scoreCompare":
      case "entity":
      case "items":
      case "block":
      case "predicate":
      case "callFunction":
      case "storeScore":
      case "storeEntity":
      case "storeStorage":
      case "storeBossbar":
        return undefined;
    }
  }

  /** What `c` itself writes. */
  private effect(c: Clause): Effect {
    return c.k === "storeEntity" ? entityWriteEffect(c.path) : Effect.NONE;
  }

  private score(s: Score, v: VersionProfile): string {
    return `${toCommandValue(s.target).render(v)} ${s.objective.objective}`;
  }

  private clause(c: Clause, v: VersionProfile, ns: string, existence: boolean): string {
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
      case "rotated":
        return `rotated ${toCommandValue(c.rot).render(v)}`;
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
        return `${c.mode} entity ${
          existence ? renderExistence(c.sel, v) : toCommandValue(c.sel).render(v)
        }`;
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
      case "storeBossbar":
        return `store ${c.mode} bossbar ${c.id.render()} ${c.field}`;
    }
  }
}

// ---------------------------------------------------------------------------
// `return run <command>`: runs a command and returns its result. Not in the generated
// `return.ts`.
// ---------------------------------------------------------------------------

export class ReturnRunNode extends ASTNode {
  readonly type = "return_run";
  runBody?: FunctionNode;
}

export class ReturnRunHandler extends CommandHandler<ReturnRunNode> {
  readonly type: ReturnRunNode["type"] = "return_run";

  generate(node: ReturnRunNode, ctx: CodegenContext): void {
    if (!node.runBody) throw new Error("returnRun() body was never built");
    const { cmd, info } = generateRunTargetLine(node.runBody, ctx.datapack, ctx.dispatcher, { keepEmpty: true });
    ctx.emit(buildTokens(ctx.version, [lit("return"), raw(`run ${cmd}`)]), {
      ...info,
      clauses: [],
      open: false,
      exits: true,
    });
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** A general `execute … run …` chain. See {@link ExecuteBuilder}. */
    execute(): ExecuteBuilder;
    /**
     * Runs the commands from `build` at `selector` with one `execute at <selector> [align]
     * run …`.
     *
     * Multiple commands go in one child function, so the selector is evaluated once.
     * `align` (e.g. "xyz") snaps to the block grid, needed for block ops at fractional
     * positions.
     */
    atEntity(
      selector: Selector,
      build: (ctx: FunctionContext) => void,
      align?: Swizzle,
    ): void;
    /**
     * Runs the commands from `build` only when `target`'s `slot` holds `item`. See {@link
     * ExecuteBuilder.ifItems}.
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
    /**
     * Score-range switch: the first matching range calls its function and returns its
     * result.
     */
    dispatchScore(
      score: Score,
      cases: readonly { range: Range; fn: FunctionRef }[],
    ): void;
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

FunctionContext.prototype.dispatchScore = function (
  this: FunctionContext,
  score: Score,
  cases: readonly { range: Range; fn: FunctionRef }[],
): void {
  for (const { range, fn } of cases) {
    this.execute()
      .ifScoreMatches(score, range)
      .run((c) => c.returnRun((x) => x.call(fn)));
  }
};
