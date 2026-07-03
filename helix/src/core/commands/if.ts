import { ASTNode, ExpressionNode, FunctionNode, Range } from "../ir/node";
import type { Objective } from "../frontend/nodes/objective";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { generateRunTarget, generateSingleNode } from "../ir/generate";
import { arg, buildTokens, lit, raw, Token } from "../ir/command-builder";
import { VersionProfile } from "../../versions/profile";
import { IfBuilder } from "../frontend/interfaces/if_builder";
import { FunctionContext } from "../frontend/context";
import { runInContext } from "../frontend/context/ambient";
import { ScoreTarget } from "../values/score_target";
import { toCommandValue } from "../values/value";
import { EntityGuardNode } from "./entity_guard";
import { NearGuardNode } from "./near_guard";
import { Selector } from "../frontend/nodes/selector";
import { Pos } from "../values";
import { Id } from "../values/id";
import { PredicateRef } from "../values/predicate";

// The score *expression* sublanguage (conditions for `if` / selector scoring).
// Not commands and have no handler of their own; the `if` handler reads them.
export class ScoreCompareNode extends ExpressionNode {
  type = "score_compare";

  constructor(
    public target: ScoreTarget,
    public targetObjective: Objective,
    public operator: "<" | "<=" | "=" | ">=" | ">",
    public source: ScoreTarget,
    public sourceObjective: Objective,
  ) {
    super();
  }
}

export class ScoreRangeNode extends ExpressionNode {
  type = "score_range";

  constructor(
    public target: ScoreTarget,
    public targetObjective: Objective,
    public range: Range,
  ) {
    super();
  }
}

/** `if predicate <id>` - defers the test to a registered predicate file. */
export class PredicateCheckNode extends ExpressionNode {
  type = "predicate_check";

  constructor(public predicateId: string) {
    super();
  }
}

/**
 * A condition that passes when a registered {@link Predicate} passes, for use
 * with `ctx.if(...)`. Accepts a {@link PredicateRef} (from `dp.predicate(...)`),
 * an {@link Id}, or a raw id string - compiles to `execute if predicate <id>`.
 */
export function predicateCheck(ref: PredicateRef | Id | string): PredicateCheckNode {
  const id =
    ref instanceof PredicateRef ? ref.id : typeof ref === "string" ? Id(ref).render() : ref.render();
  return new PredicateCheckNode(id);
}

export class IfElseNode extends ASTNode {
  type = "if_else";

  constructor(
    public condition: ExpressionNode,
    public thenBody: FunctionNode,
    public elifs: { condition: ExpressionNode; body: FunctionNode }[] = [],
    public elseBody?: FunctionNode,
  ) {
    super();
  }
}

export class IfHandler extends CommandHandler<IfElseNode> {
  type = "if_else";

  generate(node: IfElseNode, ctx: CodegenContext): void {
    this.emitBodyChain(
      ctx,
      [{ kind: "score", mode: "if", cond: node.condition }],
      node.thenBody,
    );

    for (const elif of node.elifs) {
      const elifCall = generateRunTarget(
        elif.body,
        ctx.datapack,
        ctx.dispatcher,
      );
      ctx.emit(
        this.execChain(
          ctx,
          [{ kind: "score", mode: "if", cond: elif.condition }],
          elifCall,
        ),
      );
    }
    if (node.elseBody) {
      const elseCall = generateRunTarget(
        node.elseBody,
        ctx.datapack,
        ctx.dispatcher,
      );
      if (
        node.condition instanceof ScoreRangeNode ||
        node.condition instanceof PredicateCheckNode
      ) {
        ctx.emit(
          this.execChain(
            ctx,
            [{ kind: "score", mode: "unless", cond: node.condition }],
            elseCall,
          ),
        );
      } // need to add more
    }
  }

  /**
   * A `thenBody` that is *just* one more guard (a plain if with no elif/else,
   * or an entity guard from `whenEntity`/`whenPlayerNear`) is a pure chain
   * link, not a real nested block - Minecraft's `execute` allows multiple
   * `if`/`unless` clauses before a single `run`, so fold the inner condition
   * in and recurse instead of emitting `execute ... run execute ...`. Folded
   * bodies never reach `generateRunTarget`, so no intermediate function/file
   * is created for them.
   */
  private emitBodyChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    body: FunctionNode,
  ): void {
    if (body.nodes.length === 1) {
      const folded = this.foldLink(body.nodes[0]);
      if (folded) {
        if (folded.next.kind === "body") {
          this.emitBodyChain(ctx, [...chain, folded.link], folded.next.body);
        } else {
          this.emitNodeChain(ctx, [...chain, folded.link], folded.next.node);
        }
        return;
      }
    }
    const call = generateRunTarget(body, ctx.datapack, ctx.dispatcher);
    ctx.emit(this.execChain(ctx, chain, call));
  }

  /**
   * Same folding, but past an `EntityGuardNode` there's no `FunctionNode`
   * wrapper any more (its `command` is a single bare `ASTNode`) - so once a
   * chain descends this far, a non-foldable terminal renders via
   * `generateSingleNode` (one line only) instead of `generateRunTarget`,
   * matching `EntityGuardHandler`'s own pre-existing single-line assumption.
   */
  private emitNodeChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    node: ASTNode,
  ): void {
    const folded = this.foldLink(node);
    if (folded) {
      if (folded.next.kind === "body") {
        this.emitBodyChain(ctx, [...chain, folded.link], folded.next.body);
      } else {
        this.emitNodeChain(ctx, [...chain, folded.link], folded.next.node);
      }
      return;
    }
    const call = generateSingleNode(node, ctx.datapack, ctx.dispatcher);
    ctx.emit(this.execChain(ctx, chain, call));
  }

  /** Recognize one foldable guard layer and what's inside it, or nothing. */
  private foldLink(
    node: ASTNode,
  ): { link: ChainLink; next: { kind: "body"; body: FunctionNode } | { kind: "node"; node: ASTNode } } | undefined {
    if (node instanceof IfElseNode && node.elifs.length === 0 && !node.elseBody) {
      return {
        link: { kind: "score", mode: "if", cond: node.condition },
        next: { kind: "body", body: node.thenBody },
      };
    }
    if (node instanceof EntityGuardNode) {
      return {
        link: { kind: "entity", mode: node.mode, selector: node.selector },
        next: { kind: "node", node: node.command },
      };
    }
    if (node instanceof NearGuardNode) {
      return {
        link: {
          kind: "near",
          pos: node.pos,
          radius: node.radius,
          unlessSelector: node.unlessSelector,
          perPlayer: node.perPlayer,
        },
        next: { kind: "node", node: node.command },
      };
    }
    return undefined;
  }

  /**
   * The first link is tree-validated normally. Past it, the matches/compare/
   * entity argument redirects back to `execute` (so a second `if`/`unless` is
   * valid Minecraft grammar) but the token validator doesn't follow redirects
   * - same situation as `at_entity.ts`/`near_guard.ts`, so the rest of the
   * chain goes out as `raw`, with each link's values still rendered through
   * the typed `ScoreTarget`/`Objective`/`Selector` classes, never hand-built
   * strings.
   */
  private execChain(
    ctx: CodegenContext,
    chain: ChainLink[],
    call: string,
  ): string {
    const [first, ...rest] = chain;
    const tail = [
      ...rest.map((link) => this.linkText(link, ctx.version)),
      `run ${call}`,
    ].join(" ");
    return buildTokens(ctx.version, [
      lit("execute"),
      ...this.linkTokens(first, ctx.version),
      raw(tail),
    ]);
  }

  /** Full rendered fragment for one chain link, including its own leading keyword(s). */
  private linkText(link: ChainLink, version: VersionProfile): string {
    if (link.kind === "entity") {
      return `${link.mode} entity ${toCommandValue(link.selector).render(version)}`;
    }
    if (link.kind === "near") {
      return this.nearLinkText(link, version);
    }
    return `${link.mode} ${this.conditionText(link.cond, version)}`;
  }

  private nearLinkText(
    link: Extract<ChainLink, { kind: "near" }>,
    version: VersionProfile,
  ): string {
    const posStr = toCommandValue(link.pos).render(version);
    const near = Selector.allPlayers().distance(new Range(undefined, link.radius));
    const nearStr = toCommandValue(near).render(version);
    const guard = link.unlessSelector
      ? ` unless entity ${toCommandValue(link.unlessSelector).render(version)}`
      : "";
    const match = link.perPlayer ? `as ${nearStr}` : `if entity ${nearStr}`;
    return `positioned ${posStr} ${match}${guard}`;
  }

  private conditionText(cond: ExpressionNode, version: VersionProfile): string {
    if (cond instanceof PredicateCheckNode) {
      return `predicate ${cond.predicateId}`;
    }
    if (cond instanceof ScoreRangeNode) {
      return `score ${toCommandValue(cond.target).render(version)} ${
        cond.targetObjective.objective
      } matches ${cond.range ?? "*"}`;
    }
    if (cond instanceof ScoreCompareNode) {
      return `score ${toCommandValue(cond.target).render(version)} ${
        cond.targetObjective.objective
      } ${cond.operator} ${toCommandValue(cond.source).render(version)} ${
        cond.sourceObjective.objective
      }`;
    }
    throw new Error("Unsupported condition");
  }

  /** Full token sequence for one chain link, including its own leading keyword(s). */
  private linkTokens(link: ChainLink, version: VersionProfile): Token[] {
    if (link.kind === "entity") {
      return [
        lit(link.mode),
        lit("entity"),
        arg(toCommandValue(link.selector).render(version)),
      ];
    }
    if (link.kind === "near") {
      return this.nearLinkTokens(link, version);
    }
    return [lit(link.mode), ...this.condition(link.cond, version)];
  }

  private nearLinkTokens(
    link: Extract<ChainLink, { kind: "near" }>,
    version: VersionProfile,
  ): Token[] {
    const near = Selector.allPlayers().distance(new Range(undefined, link.radius));
    const tokens: Token[] = [
      lit("positioned"),
      arg(toCommandValue(link.pos).render(version)),
      lit(link.perPlayer ? "as" : "if"),
      ...(link.perPlayer ? [] : [lit("entity")]),
      arg(toCommandValue(near).render(version)),
    ];
    if (link.unlessSelector) {
      tokens.push(
        lit("unless"),
        lit("entity"),
        arg(toCommandValue(link.unlessSelector).render(version)),
      );
    }
    return tokens;
  }

  private condition(cond: ExpressionNode, version: VersionProfile): Token[] {
    if (cond instanceof PredicateCheckNode) {
      return [lit("predicate"), arg(cond.predicateId)];
    }
    if (cond instanceof ScoreRangeNode) {
      return [
        lit("score"),
        arg(toCommandValue(cond.target).render(version)),
        arg(cond.targetObjective.objective),
        lit("matches"),
        arg(`${cond.range ?? "*"}`),
      ];
    }
    if (cond instanceof ScoreCompareNode) {
      return [
        lit("score"),
        arg(toCommandValue(cond.target).render(version)),
        arg(cond.targetObjective.objective),
        lit(cond.operator),
        arg(toCommandValue(cond.source).render(version)),
        arg(cond.sourceObjective.objective),
      ];
    }
    throw new Error("Unsupported condition");
  }
}

/**
 * One link in a chained `execute`: a score condition, an entity guard
 * (`if`/`unless entity`), or a near-player guard (`positioned ... if/as
 * entity ... [unless entity ...]`, from `whenPlayerNear`).
 */
type ChainLink =
  | { kind: "score"; mode: "if" | "unless"; cond: ExpressionNode }
  | { kind: "entity"; mode: "if" | "unless"; selector: Selector | string }
  | {
      kind: "near";
      pos: Pos;
      radius: number;
      unlessSelector?: Selector;
      perPlayer: boolean;
    };

declare module "../frontend/context" {
  interface FunctionContext {
    /** `if`/`elif`/`else` control flow; bodies compile to child functions. */
    if(
      condition: ExpressionNode,
      thenFn: (ctx: FunctionContext) => void,
    ): IfBuilder;
  }
}

FunctionContext.prototype.if = function (
  this: FunctionContext,
  condition: ExpressionNode,
  thenFn: (ctx: FunctionContext) => void,
): IfBuilder {
  // A fully-composed child context over `fn`, carrying this context's version.
  const newChild = (fn: FunctionNode): FunctionContext =>
    new (this.constructor as new (
      fn: FunctionNode,
      v: VersionProfile,
    ) => FunctionContext)(fn, this.version);

  const thenBody = this.createChildFunction("if");
  runInContext(newChild(thenBody), thenFn);

  const node = new IfElseNode(condition, thenBody);
  this.emit(node);

  const builder: IfBuilder = {
    elif: (cond, fn) => {
      const body = this.createChildFunction("elif");
      runInContext(newChild(body), fn);
      node.elifs.push({ condition: cond, body });
      return builder;
    },
    else: (fn) => {
      const body = this.createChildFunction("else");
      runInContext(newChild(body), fn);
      node.elseBody = body;
    },
  };

  return builder;
};
