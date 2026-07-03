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
import { Block, EntityAnchor, Id, NbtPath, Pos } from "../values";
import { toCommandValue } from "../values/value";
import { PredicateRef } from "../values/predicate";

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
  | { k: "scoreMatches"; mode: Cond; score: Score; range: Range }
  | { k: "scoreCompare"; mode: Cond; a: Score; op: "<" | "<=" | "=" | ">=" | ">"; b: Score }
  | { k: "entity"; mode: Cond; sel: Selector }
  | { k: "block"; mode: Cond; pos: Pos; block: Block }
  | { k: "predicate"; mode: Cond; id: string }
  | { k: "storeScore"; mode: StoreMode; score: Score }
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
  storeResultStorage(id: Id, path: NbtPath, type: StoreNumType, scale: number): this {
    this.node.clauses.push({ k: "storeStorage", mode: "result", id, path, type, scale });
    return this;
  }
  storeSuccessStorage(id: Id, path: NbtPath, type: StoreNumType, scale: number): this {
    this.node.clauses.push({ k: "storeStorage", mode: "success", id, path, type, scale });
    return this;
  }

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
}

export class ExecuteHandler extends CommandHandler<ExecuteNode> {
  readonly type: ExecuteNode["type"] = "execute";

  generate(node: ExecuteNode, ctx: CodegenContext): void {
    const v = ctx.version;
    const parts = node.clauses.map((c) => this.clause(c, v));
    if (node.runBody) {
      const cmd = generateRunTarget(node.runBody, ctx.datapack, ctx.dispatcher);
      parts.push(`run ${cmd}`);
    }
    ctx.emit(buildTokens(v, [lit("execute"), raw(parts.join(" "))]));
  }

  private score(s: Score, v: VersionProfile): string {
    return `${toCommandValue(s.target).render(v)} ${s.objective.objective}`;
  }

  private clause(c: Clause, v: VersionProfile): string {
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
      case "scoreMatches":
        return `${c.mode} score ${this.score(c.score, v)} matches ${c.range}`;
      case "scoreCompare":
        return `${c.mode} score ${this.score(c.a, v)} ${c.op} ${this.score(c.b, v)}`;
      case "entity":
        return `${c.mode} entity ${toCommandValue(c.sel).render(v)}`;
      case "block":
        return `${c.mode} block ${toCommandValue(c.pos).render(v)} ${c.block.render()}`;
      case "predicate":
        return `${c.mode} predicate ${c.id}`;
      case "storeScore":
        return `store ${c.mode} score ${this.score(c.score, v)}`;
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
