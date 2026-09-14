// Formula error messages: quoting the offending subexpression and pointing at the column.
import jsep from "jsep";

/** jsep carries no source spans, so quote the offending subexpression instead. */
export function show(n: jsep.Expression): string {
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

export function fail(message: string, src: string, index?: number): never {
  const caret = index === undefined ? "" : `\n    ${" ".repeat(index)}^`;
  throw new Error(
    `math\`\`: ${message}\n    ${src}${caret}\n  (\${} holes appear above as _0, _1, … in source order)`,
  );
}
