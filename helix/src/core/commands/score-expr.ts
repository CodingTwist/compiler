// HAND-WRITTEN. Chooses the backend for score arithmetic.
//
// 26.3+ uses one `/compute` command; older versions get a `scoreboard players operation`
// chain.
// Both compute the same integers for the portable ops. Compute-only ops (`sqrt`, trig,
// rounding,
// `pow`, `avg`, `len`), providers and fractional literals `reject()` below 26.3 as a build
// error.
//
// The version is only known at codegen, so the frontend emits one node and this lowers it.
//
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs.
import { ASTNode } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { buildTokens, lit, arg, raw } from "../ir/command-builder";
import { hasCommandTree } from "../ir/command-validator";
import { Score } from "../frontend/nodes/score";
import {
  ComputeOnlyOp,
  ExprNode,
  ExprOp,
  FloatOp,
  isComputeOnly,
  isFloatOp,
  litE,
  opE,
} from "../frontend/nodes/expr";
import { ScoreTarget } from "../values/score_target";
import {
  ContextFloat as f,
  ContextFloatProvider,
  ContextInt as i,
  ContextIntProvider,
  FloatRef,
  IntRef,
} from "../values/context-provider";
import { supportsCommand } from "../../versions/capabilities";
import { VersionProfile } from "../../versions/profile";
import { BrigadierNode } from "../commandtree/tree";
import { currentContext } from "../frontend/context/ambient";
import type { FunctionContext } from "../frontend/context";
import { ScoreOperator, scoreLitNode, scoreOpNode } from "./scoreboard";

export class ScoreExprNode extends ASTNode {
  readonly type = "score-expr";
  constructor(
    /** The slot the expression's value lands in. */
    public readonly dest: Score,
    /** The formula, backend-agnostic. */
    public readonly expr: ExprNode,
  ) {
    super();
  }
}

/**
 * `/compute` exists and the profile has a command tree.
 * Unlike {@link supportsCommand}, a stub profile answers false, so packs don't switch to a
 * command the target may lack.
 */
const hasCompute = (version: VersionProfile): boolean =>
  hasCommandTree(version.commands as BrigadierNode | undefined) &&
  supportsCommand(version, ["compute"]);

export class ScoreExprCommand extends CommandHandler<ScoreExprNode> {
  readonly type: ScoreExprNode["type"] = "score-expr";

  generate(node: ScoreExprNode, ctx: CodegenContext): void {
    if (!hasCompute(ctx.version)) {
      for (const n of toScoreOps(node.dest, node.expr, ctx.version))
        ctx.dispatcher.dispatch(n, ctx);
      return;
    }
    // `compute` is validated alone; the `execute store … run` head is raw because the
    // data's redirects drop it.
    const compute = buildTokens(ctx.version, [
      lit("compute"),
      lit("default"),
      lit("integer"),
      arg(toProvider(node.expr).render(ctx.version)),
    ]);
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        raw(
          `store result score ${node.dest.target.render(ctx.version)} ` +
            `${node.dest.objective.getName()} run ${compute}`,
        ),
      ]),
    );
  }
}

/** 26.3+ lowering: the whole tree as one `context_int_provider`. */
export function toProvider(e: ExprNode): ContextIntProvider {
  const r = asInt(ref(e));
  return typeof r === "number" ? i.raw(r) : r;
}

/** The same tree, left on the float side - for a non-integer destination. */
export function toFloatProvider(e: ExprNode): ContextFloatProvider {
  const r = asFloat(ref(e));
  return typeof r === "number" ? f.raw(r) : r;
}

/**
 * A subexpression and whether it's float. Integer literals are valid on both sides, so
 * they're untagged.
 */
type Ref = { float: boolean; v: IntRef | FloatRef };

/** Widen to float: free for a literal, one `from_int` otherwise. */
const asFloat = (r: Ref): FloatRef =>
  r.float || typeof r.v === "number"
    ? (r.v as FloatRef)
    : f.fromInt(r.v as ContextIntProvider);

/** Truncate to int (toward 0, which is floor for a non-negative value). */
const asInt = (r: Ref): IntRef =>
  !r.float
    ? (r.v as IntRef)
    : typeof r.v === "number"
      ? Math.trunc(r.v)
      : i.fromFloat(r.v as ContextFloatProvider);

const ref = (e: ExprNode): Ref => {
  switch (e.kind) {
    case "lit":
      // A fractional literal makes its expression float, e.g. `${a} / 2.0`.
      return { float: !Number.isInteger(e.value), v: e.value };
    case "score":
      return { float: false, v: i.score(e.score) };
    case "provider":
      return {
        float: e.provider instanceof ContextFloatProvider,
        v: e.provider,
      };
    case "op": {
      const args = e.args.map(ref);
      // Float ops are float; other ops follow their operands, so int formulas lower as
      // before.
      if (isFloatOp(e.op)) return { float: true, v: floatOnlyOp(e.op, args) };
      const float = args.some((a) => a.float);
      if (float) {
        const a = args.map(asFloat);
        return { float: true, v: floatOp(e.op, a) };
      }
      return { float: false, v: intOp(e.op, args.map(asInt)) };
    }
  }
};

/** The ops that only exist on the float side - operands widened on the way in. */
const floatOnlyOp = (op: FloatOp, args: Ref[]): FloatRef => {
  const a = args.map(asFloat);
  switch (op) {
    // `length` IS `sqrt(Σ xᵢ²)`, so a vector length is one node, not four.
    case "len":
      return f.length(...a);
    case "sqrt":
      return f.sqrt(a[0]);
    case "sin":
      return f.sin(a[0]);
    case "cos":
      return f.cos(a[0]);
    case "round":
      return f.round(a[0]);
    case "floor":
      return f.floor(a[0]);
    case "ceil":
      return f.ceil(a[0]);
  }
};

/** The shared ops, in whichever namespace the operands settled on. */
const intOp = (op: Exclude<ExprOp, FloatOp>, a: IntRef[]): IntRef => {
  switch (op) {
    case "add":
      return i.add(...a);
    case "mul":
      return i.mul(...a);
    case "min":
      return i.min(...a);
    case "max":
      return i.max(...a);
    case "avg":
      return i.avg(...a);
    case "sub":
      return i.sub(a[0], a[1]);
    // Scoreboard semantics, which is the side that can't be changed.
    case "div":
      return i.floorDiv(a[0], a[1]);
    case "mod":
      return i.floorMod(a[0], a[1]);
    case "pow":
      return i.pow(a[0], a[1]);
    case "abs":
      return i.abs(a[0]);
    case "neg":
      return i.negate(a[0]);
  }
};

const floatOp = (op: Exclude<ExprOp, FloatOp>, a: FloatRef[]): FloatRef => {
  switch (op) {
    case "add":
      return f.add(...a);
    case "mul":
      return f.mul(...a);
    case "min":
      return f.min(...a);
    case "max":
      return f.max(...a);
    case "avg":
      return f.avg(...a);
    case "sub":
      return f.sub(a[0], a[1]);
    // No scoreboard to match once we're in floats: real division, not floored.
    case "div":
      return f.div(a[0], a[1]);
    case "mod":
      return f.mod(a[0], a[1]);
    case "pow":
      return f.pow(a[0], a[1]);
    case "abs":
      return f.abs(a[0]);
    case "neg":
      return f.negate(a[0]);
  }
};

const SYM: Record<
  Exclude<ExprOp, "abs" | "neg" | ComputeOnlyOp>,
  ScoreOperator
> = {
  add: "+=",
  sub: "-=",
  mul: "*=",
  div: "/=",
  mod: "%=",
  min: "<",
  max: ">",
};

/**
 * Throws for a compute-only op on a target without `/compute`, naming the op, target and
 * fixes.
 */
function reject(what: string, version: VersionProfile): never {
  throw new Error(
    `math\`\`: ${what} needs /compute, which arrived in Minecraft 26.3 - this pack targets ${version.id}. ` +
      `Scoreboards are integer-only and have no real arithmetic to lower it to, so there is no fallback: ` +
      `either raise the pack's version, or compute it yourself (fixed-point scaling, Newton iteration, a lookup table).`,
  );
}

/**
 * ≤26.2 lowering: an equivalent `scoreboard players operation` chain.
 *
 * - Accumulate into the destination, folding each operand in with one `<op>=`.
 * - Literals are free for `+`/`-`; anything else costs a `set <temp> <n>`.
 * - If `dest` appears anywhere but the leftmost leaf, work in a temp and copy back.
 *
 * Temps are `#_t<depth>` on `dest`'s objective, reused by depth, so nothing needs
 * registering.
 */
export function toScoreOps(
  dest: Score,
  e: ExprNode,
  version: VersionProfile,
): ASTNode[] {
  const out: ASTNode[] = [];
  const key = (s: Score) =>
    `${s.target.render(version)} ${s.objective.getName()}`;
  const destKey = key(dest);
  const temp = (depth: number) =>
    dest.objective.score(ScoreTarget(`#_t${depth}`));

  const emit = (t: Score, n: ExprNode, depth: number): void => {
    if (n.kind === "lit") {
      // A fractional constant alone can't be expressed in integer commands.
      if (!Number.isInteger(n.value))
        reject(`the fractional literal ${n.value}`, version);
      out.push(scoreLitNode("set", t, n.value));
      return;
    }
    if (n.kind === "score") {
      if (key(n.score) !== key(t)) out.push(scoreOpNode(t, "=", n.score));
      return;
    }
    if (n.kind === "provider") reject("a /compute provider leaf", version);
    // No unary minus on a scoreboard: `0 - x` beats materialising a -1 slot.
    if (n.op === "neg") {
      emit(t, opE("sub", litE(0), n.args[0]), depth);
      return;
    }
    if (isComputeOnly(n.op)) reject(`${n.op}()`, version);
    if (n.op === "abs") {
      emit(t, n.args[0], depth);
      const neg = temp(depth);
      out.push(
        scoreLitNode("set", neg, 0),
        scoreOpNode(neg, "-=", t),
        scoreOpNode(t, ">", neg),
      );
      return;
    }
    emit(t, n.args[0], depth);
    for (const a of n.args.slice(1)) {
      if (
        a.kind === "lit" &&
        Number.isInteger(a.value) &&
        (n.op === "add" || n.op === "sub")
      ) {
        const v = n.op === "add" ? a.value : -a.value;
        out.push(scoreLitNode(v < 0 ? "remove" : "add", t, Math.abs(v)));
      } else if (a.kind === "score") {
        out.push(scoreOpNode(t, SYM[n.op], a.score));
      } else {
        const tmp = temp(depth);
        emit(tmp, a, depth + 1);
        out.push(scoreOpNode(t, SYM[n.op], tmp));
      }
    }
  };

  let uses = 0;
  const count = (n: ExprNode): void => {
    if (n.kind === "score") uses += key(n.score) === destKey ? 1 : 0;
    else if (n.kind === "op") n.args.forEach(count);
  };
  count(e);
  let left = e;
  while (left.kind === "op") left = left.args[0];
  const inPlace =
    uses === 0 ||
    (uses === 1 && left.kind === "score" && key(left.score) === destKey);

  const slot = inPlace ? dest : temp(0);
  emit(slot, e, inPlace ? 0 : 1);
  if (!inPlace) out.push(scoreOpNode(dest, "=", slot));
  return out;
}

/** Emit `dest = <expr>` into the ambient context (or `ctx`), backend chosen at codegen. */
export function emitScoreExpr(
  dest: Score,
  expr: ExprNode,
  ctx?: FunctionContext,
): void {
  const target = ctx ?? currentContext();
  if (!target)
    throw new Error(
      "Score arithmetic has no active context: call it inside a build()/run()/if() callback, or pass ctx explicitly.",
    );
  target.emit(new ScoreExprNode(dest, expr));
}
