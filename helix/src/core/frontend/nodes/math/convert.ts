// Turns jsep's parse tree into score expressions, resolving holes and vector vs scalar.
import jsep from "jsep";
import { ExprNode, opE, litE } from "../expr";
import { fail, show } from "./errors";
import type { Operand, Val } from "./types";
import { cross, dot, map, nary, operand, scalar, zip } from "./vals";

const BIN: Record<string, "add" | "sub" | "mul" | "div" | "mod"> = {
  "+": "add",
  "-": "sub",
  "*": "mul",
  "/": "div",
  "%": "mod",
};

/** jsep's tree -> ours, resolving holes and the vector/scalar distinction. */
export function convert(
  node: jsep.Expression,
  src: string,
  holes: Operand[],
): Val {
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
          case "cross":
            arity(2);
            return cross(args[0], args[1], src);
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
                `sin, cos, round, floor, ceil, len, dot, cross, len2, vec`,
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
