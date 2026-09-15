// The `math` tag and `MathExpr`, the parsed formula waiting for a destination.
import jsep from "jsep";
import { Score } from "../score";
import { ScoreVec3 } from "../score_vec3";
import { ExprNode } from "../expr";
import {
  ContextFloatProvider,
  ContextIntProvider,
} from "../../../values/context-provider";
import {
  emitScoreExpr,
  toFloatProvider,
  toProvider,
} from "../../../commands/score-expr";
import type { FunctionContext } from "../../context";
import { convert } from "./convert";
import { fail } from "./errors";
import type { Operand, Val } from "./types";

// `·` as dot product at multiplication precedence. Registering it also stops jsep treating
// it as an identifier character.
jsep.addBinaryOp("·", 10);

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
