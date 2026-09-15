// Evaluates a `/compute` provider tree the way 26.3 does: floats are 32-bit, and an int
// overflow, a division by zero or a missing score fails the command instead of wrapping.

/** A command that failed in game: it stores 0 and stops its `execute` branch. */
export class CommandError extends Error {}

/** Reads the values a provider can reference. `holder` is null for the context entity. */
export interface ComputeSource {
  score(holder: string | null, objective: string): number | undefined;
  storage(id: string, path: string): number | undefined;
}

type Node = number | { type: string; [k: string]: unknown };

const f32 = Math.fround;
const fail = (why: string): never => {
  throw new CommandError(why);
};
/** Java's `longToIntSafe`: out of int range throws. */
const exact = (v: number): number =>
  Number.isSafeInteger(v) && v === (v | 0) ? v : fail(`int overflow: ${v}`);

/** Evaluates an int provider (`compute ... integer`). */
export function evalInt(n: Node, src: ComputeSource): number {
  if (typeof n === "number") return n;
  const i = (k: string) => evalInt(n[k] as Node, src);
  const all = () => (n.inputs as Node[]).map((x) => evalInt(x, src));
  switch (n.type) {
    case "constant":
      return n.value as number;
    case "add":
      return exact(all().reduce((a, b) => a + b, 0));
    case "mul":
      return exact(all().reduce((a, b) => Number(BigInt(a) * BigInt(b)), 1));
    case "avg": {
      const xs = all();
      return exact(Math.trunc(xs.reduce((a, b) => a + b, 0) / xs.length));
    }
    case "min":
      return Math.min(...all());
    case "max":
      return Math.max(...all());
    case "sub":
      return exact(i("left") - i("right"));
    case "div":
    case "floor_div":
    case "mod":
    case "floor_mod": {
      const [a, b] = [i("left"), i("right")];
      if (b === 0) fail("division by zero");
      const q = n.type.startsWith("floor") ? Math.floor(a / b) : Math.trunc(a / b);
      return n.type.endsWith("div") ? exact(q) : a - q * b;
    }
    case "negate":
      return exact(-i("input"));
    case "abs":
      return exact(Math.abs(i("input")));
    case "pow": {
      const [a, b] = [i("base"), i("exponent")];
      if (a === 0 && b === 0) fail("0 to the power of 0");
      return exact(a ** b);
    }
    case "from_float": {
      const v = evalFloat(n.input as Node, src);
      return Number.isFinite(v) ? exact(Math.trunc(v)) : fail(`not finite: ${v}`);
    }
    case "score":
      return read(n, (h, o) => src.score(h, o), (x) => evalInt(x, src));
    case "storage":
      return read(n, (id, p) => src.storage(id!, p), (x) => evalInt(x, src), Math.trunc);
    default:
      throw new Error(`unsupported int provider ${n.type}`);
  }
}

/** Evaluates a float provider; every step is rounded to a Java float. */
export function evalFloat(n: Node, src: ComputeSource): number {
  if (typeof n === "number") return f32(n);
  const x = (k: string) => evalFloat(n[k] as Node, src);
  const all = () => (n.inputs as Node[]).map((y) => evalFloat(y, src));
  switch (n.type) {
    case "constant":
      return f32(n.value as number);
    case "add":
      return all().reduce((a, b) => f32(a + b), 0);
    case "mul":
      return all().reduce((a, b) => f32(a * b), 1);
    case "avg": {
      const xs = all();
      return f32(xs.reduce((a, b) => f32(a + b), 0) / xs.length);
    }
    case "min":
      return Math.min(...all());
    case "max":
      return Math.max(...all());
    case "length":
      return f32(Math.sqrt(all().reduce((a, b) => f32(a + f32(b * b)), 0)));
    case "sub":
      return f32(x("left") - x("right"));
    case "div":
      return f32(x("left") / x("right"));
    case "mod": {
      const [a, b] = [x("left"), x("right")];
      return b === 0 ? NaN : f32(((a % b) + b) % b);
    }
    case "negate":
      return -x("input");
    case "abs":
      return Math.abs(x("input"));
    case "pow":
      return f32(x("base") ** x("exponent"));
    case "sqrt":
      return f32(Math.sqrt(x("input")));
    // ponytail: Math.sin, while the game may use its lookup table; tiny differences only.
    case "sin":
      return f32(Math.sin(x("input")));
    case "cos":
      return f32(Math.cos(x("input")));
    case "floor":
      return f32(Math.floor(x("input")));
    case "ceil":
      return f32(Math.ceil(x("input")));
    case "round":
      return f32(Math.floor(x("input") + 0.5));
    case "truncate":
      return f32(Math.trunc(x("input")));
    case "from_int":
      return f32(evalInt(n.input as Node, src));
    case "score":
      return f32(read(n, (h, o) => src.score(h, o), (y) => evalFloat(y, src)));
    case "storage":
      return f32(read(n, (id, p) => src.storage(id!, p), (y) => evalFloat(y, src)));
    default:
      throw new Error(`unsupported float provider ${n.type}`);
  }
}

/** A `score` or `storage` leaf: its value, else the fallback, else the command fails. */
function read(
  n: { [k: string]: unknown },
  get: (a: string | null, b: string) => number | undefined,
  fallback: (x: Node) => number,
  cast: (v: number) => number = (v) => v,
): number {
  let v: number | undefined;
  if (n.type === "score") {
    const t = n.target as { type: string; name?: string };
    v = get(t.type === "context" ? null : t.name!, n.score as string);
  } else v = get(n.storage as string, n.path as string);
  if (v !== undefined) return cast(v);
  if (n.fallback !== undefined) return fallback(n.fallback as Node);
  return fail(`no value for ${JSON.stringify(n)}`);
}
