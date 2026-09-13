import jsep from "jsep";
import { Score } from "./score";
import { ScoreVec3 } from "./score_vec3";
import { ExprNode, ExprOp, litE, opE, providerE, scoreE } from "./expr";
import {
  ContextFloatProvider,
  ContextIntProvider,
} from "../../values/context-provider";
import {
  emitScoreExpr,
  toFloatProvider,
  toProvider,
} from "../../commands/score-expr";
import type { FunctionContext } from "../context";

// `·` as dot product at multiplication precedence. Registering it also stops jsep treating
// it as an identifier character.
jsep.addBinaryOp("·", 10);

/** Anything that can be interpolated into a {@link math} formula. */
export type Operand =
  | number
  | Score
  | ScoreVec3
  | MathExpr
  | ContextIntProvider
  | ContextFloatProvider;

/** A parsed formula: either one integer expression or three (a vector). */
type Val =
  | { vec: false; e: ExprNode }
  | { vec: true; e: [ExprNode, ExprNode, ExprNode] };

/**
 * Integer maths over scores: one `/compute` on 26.3+, an equivalent `scoreboard players
 * operation`
 * chain below.
 *
 * ```ts
 * math`-${dot} + min((${distSq} - ${ropeLenSq}) / ${BAUM_DIV}, ${BAUM_MAX})`.into(coef);
 * math`vec(${i} · ${g}, ${j} · ${g}, ${k} · ${g}) / 100000`.into(local);
 * ```
 *
 * Holes are `Score`, `ScoreVec3`, numbers or other `math` expressions. A string language is
 * fine
 * here because arithmetic doesn't change between versions.
 *
 * Everywhere: `+ - * / %`, unary `-`, `min`, `max`, `abs`, `dot`, `len2`, `vec`. `/` and
 * `%` floor
 * like the scoreboard. Vector holes apply per axis.
 *
 * 26.3+ only (throws on older targets): `sqrt`, `sin`, `cos`, `pow`, `avg`, `round`,
 * `floor`,
 * `ceil`, `len`, fractional literals, and `ContextInt`/`ContextFloat` providers:
 *
 * ```ts
 * math`round(${ContextFloat.uniform(0, 1)} * ${spread}) + ${base}`.into(out);
 * ```
 *
 * These are float and truncate once at the destination, so `sqrt(${x}) / 2` halves the real
 * root.
 * Careful: `%` is truncated on the float side, so `-5 % 2` is `1` as int but `-1` as float.
 */
export function math(
  strings: TemplateStringsArray,
  ...holes: Operand[]
): MathExpr {
  const src = strings.reduce((s, part, idx) => s + `_${idx - 1}` + part);
  let tree: jsep.Expression;
  try {
    tree = jsep(src);
  } catch (err) {
    const at = (err as { index?: number }).index;
    fail((err as Error).message.replace(/ at character \d+$/, ""), src, at);
  }
  return new MathExpr(convert(tree, src, holes));
}

/** A parsed {@link math} formula, waiting for a destination. */
export class MathExpr {
  /** @internal */
  constructor(readonly val: Val) {}

  /** Emit `dest = <this>`. A vector formula needs a `ScoreVec3` destination. */
  into(dest: Score | ScoreVec3, ctx?: FunctionContext): void {
    if (this.val.vec) {
      if (dest instanceof Score)
        throw new Error(
          "math``: this formula is a vector - `into()` needs a ScoreVec3 destination (use `· ` or `len2()` to reduce it to a scalar).",
        );
      dest.components.forEach((slot, axis) =>
        emitScoreExpr(slot, (this.val as { e: ExprNode[] }).e[axis], ctx),
      );
      return;
    }
    if (!(dest instanceof Score))
      throw new Error(
        "math``: this formula is a scalar - `into()` needs a single Score destination, not a ScoreVec3.",
      );
    emitScoreExpr(dest, this.val.e, ctx);
  }

  /**
   * The formula as a `/compute` argument, for destinations `.into()` can't reach. 26.3+
   * only.
   */
  get provider(): ContextIntProvider {
    return toProvider(this.scalar("provider"));
  }

  /** {@link provider}, left on the float side - for a `float` store target. */
  get floatProvider(): ContextFloatProvider {
    return toFloatProvider(this.scalar("floatProvider"));
  }

  private scalar(what: string): ExprNode {
    if (this.val.vec)
      throw new Error(
        `math\`\`: this formula is a vector - \`${what}\` is one expression (use \`·\`/\`dot()\`/\`len()\` to reduce it to a scalar, or take an axis).`,
      );
    return this.val.e;
  }
}

const BIN: Record<string, "add" | "sub" | "mul" | "div" | "mod"> = {
  "+": "add",
  "-": "sub",
  "*": "mul",
  "/": "div",
  "%": "mod",
};

/** jsep's tree -> ours, resolving holes and the vector/scalar distinction. */
function convert(node: jsep.Expression, src: string, holes: Operand[]): Val {
  const go = (n: jsep.Expression): Val => {
    switch (n.type) {
      case "Literal": {
        const v = (n as jsep.Literal).value;
        if (typeof v !== "number")
          fail(`only numbers are literals here, not \`${show(n)}\``, src);
        return scalar(litE(v));
      }
      case "Identifier": {
        const m = /^_(\d+)$/.exec((n as jsep.Identifier).name);
        if (!m)
          fail(
            `unknown name \`${show(n)}\` - values come from \${} holes, not bare names`,
            src,
          );
        return operand(holes[Number(m[1])], src);
      }
      case "UnaryExpression": {
        const u = n as jsep.UnaryExpression;
        if (u.operator === "+") return go(u.argument);
        if (u.operator !== "-")
          fail(`unsupported unary operator \`${u.operator}\``, src);
        return map(go(u.argument), (e) => opE("neg", e));
      }
      case "BinaryExpression": {
        const b = n as jsep.BinaryExpression;
        const l = go(b.left);
        const r = go(b.right);
        if (b.operator === "·") return dot(l, r, src);
        const op = BIN[b.operator];
        if (!op) fail(`unsupported operator \`${b.operator}\``, src);
        return zip(op, l, r, src, show(n));
      }
      case "CallExpression": {
        const c = n as jsep.CallExpression;
        const callee = c.callee as jsep.Identifier;
        const name = callee.type === "Identifier" ? callee.name : show(callee);
        const args = c.arguments.map(go);
        const arity = (k: number) => {
          if (args.length !== k)
            fail(
              `\`${name}()\` takes ${k} argument(s), got ${args.length}`,
              src,
            );
        };
        switch (name) {
          case "min":
          case "max":
            arity(2);
            return zip(name, args[0], args[1], src, show(n));
          case "abs":
          case "sqrt":
          case "sin":
          case "cos":
          case "round":
          case "floor":
          case "ceil":
            arity(1);
            return map(args[0], (e) => opE(name, e));
          case "pow":
            arity(2);
            return zip("pow", args[0], args[1], src, show(n));
          case "avg":
            if (!args.length) fail("`avg()` takes at least one argument", src);
            return nary("avg", args);
          // `len(v)` is one `length` node instead of `sqrt(len2(v))`. Scalar arguments give
          // a hypotenuse.
          case "len":
            if (!args.length) fail("`len()` takes at least one argument", src);
            if (args.length === 1 && args[0].vec)
              return scalar(opE("len", ...args[0].e));
            return scalar(
              opE(
                "len",
                ...args.map((a, idx) => {
                  if (a.vec)
                    fail(
                      `\`len()\` takes one vector or a list of scalars; argument ${idx + 1} is a vector`,
                      src,
                    );
                  return a.e;
                }),
              ),
            );
          case "dot":
            arity(2);
            return dot(args[0], args[1], src);
          case "len2":
            arity(1);
            return dot(args[0], args[0], src);
          case "vec":
            arity(3);
            return {
              vec: true,
              e: args.map((a, idx) => {
                if (a.vec)
                  fail(
                    `\`vec()\` takes scalars; argument ${idx + 1} is a vector`,
                    src,
                  );
                return a.e;
              }) as [ExprNode, ExprNode, ExprNode],
            };
          default:
            return fail(
              `unknown function \`${name}()\` - available: min, max, abs, avg, pow, sqrt, ` +
                `sin, cos, round, floor, ceil, len, dot, len2, vec`,
              src,
            );
        }
      }
      default:
        fail(`\`${show(n)}\` is not math (${n.type})`, src);
    }
  };
  return go(node);
}

const scalar = (e: ExprNode): Val => ({ vec: false, e });

const map = (v: Val, f: (e: ExprNode) => ExprNode): Val =>
  v.vec
    ? { vec: true, e: v.e.map(f) as [ExprNode, ExprNode, ExprNode] }
    : scalar(f(v.e));

/** A variadic op over any mix of scalars and vectors, broadcasting per axis. */
function nary(op: ExprOp, args: Val[]): Val {
  if (!args.some((a) => a.vec))
    return scalar(opE(op, ...args.map((a) => a.e as ExprNode)));
  return {
    vec: true,
    e: axes((idx) =>
      opE(op, ...args.map((a) => (a.vec ? a.e[idx] : (a.e as ExprNode)))),
    ),
  };
}

/** Per-axis when either side is a vector; vector-by-vector arithmetic is an error. */
function zip(op: ExprOp, l: Val, r: Val, src: string, text: string): Val {
  if (!l.vec && !r.vec) return scalar(opE(op, l.e, r.e));
  if (l.vec && r.vec && op !== "add" && op !== "sub")
    fail(
      `\`${text}\` combines two vectors with \`${op}\` - use \`·\`/\`dot()\` for a dot product, or reduce one side to a scalar`,
      src,
    );
  const at = (v: Val, i: number) => (v.vec ? v.e[i] : v.e);
  return { vec: true, e: axes((i) => opE(op, at(l, i), at(r, i))) };
}

function dot(l: Val, r: Val, src: string): Val {
  if (!l.vec || !r.vec) fail("`·`/`dot()` needs a vector on both sides", src);
  return scalar(opE("add", ...axes((i) => opE("mul", l.e[i], r.e[i]))));
}

const axes = (f: (i: number) => ExprNode): [ExprNode, ExprNode, ExprNode] => [
  f(0),
  f(1),
  f(2),
];

function operand(o: Operand | undefined, src: string): Val {
  if (typeof o === "number") return scalar(litE(o));
  if (o instanceof Score) return scalar(scoreE(o));
  if (o instanceof ScoreVec3)
    return { vec: true, e: axes((i) => scoreE(o.components[i])) };
  if (o instanceof MathExpr) return o.val;
  if (o instanceof ContextIntProvider || o instanceof ContextFloatProvider)
    return scalar(providerE(o));
  fail(
    `a \${} hole must be a number, Score, ScoreVec3, a /compute provider or another math\`\` expression (got ${typeof o})`,
    src,
  );
}

/** jsep carries no source spans, so quote the offending subexpression instead. */
function show(n: jsep.Expression): string {
  switch (n.type) {
    case "BinaryExpression": {
      const b = n as jsep.BinaryExpression;
      return `${show(b.left)} ${b.operator} ${show(b.right)}`;
    }
    case "UnaryExpression": {
      const u = n as jsep.UnaryExpression;
      return `${u.operator}${show(u.argument)}`;
    }
    case "CallExpression": {
      const c = n as jsep.CallExpression;
      return `${show(c.callee)}(${c.arguments.map(show).join(", ")})`;
    }
    case "MemberExpression": {
      const m = n as jsep.MemberExpression;
      return `${show(m.object)}.${show(m.property)}`;
    }
    case "Identifier":
      return (n as jsep.Identifier).name;
    case "Literal":
      return String((n as jsep.Literal).raw ?? (n as jsep.Literal).value);
    default:
      return n.type;
  }
}

function fail(message: string, src: string, index?: number): never {
  const caret = index === undefined ? "" : `\n    ${" ".repeat(index)}^`;
  throw new Error(
    `math\`\`: ${message}\n    ${src}${caret}\n  (\${} holes appear above as _0, _1, … in source order)`,
  );
}
