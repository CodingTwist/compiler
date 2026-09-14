// 26.3+ lowering of a score expression to one `context_int_provider` (or float provider).
import { ExprNode, ExprOp, FloatOp, isFloatOp } from "../../frontend/nodes/expr";
import {
  ContextFloat as f,
  ContextFloatProvider,
  ContextInt as i,
  ContextIntProvider,
  FloatRef,
  IntRef,
} from "../../values/context-provider";

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
