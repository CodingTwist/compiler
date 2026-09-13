// The AST node vocabulary: the base classes every node extends. These are the
// IR's shared kernel (not tied to any one command), so they live in ir/ rather
// than a folder of their own. Each command's concrete node lives WITH its
// handler in src/core/commands/<cmd>.ts.
import { CommandValue } from "../values/value";
import { captureSource } from "../debug/sources";

export abstract class ASTNode {
  abstract type: string;
}

export abstract class ExpressionNode extends ASTNode {
  abstract type: string;
}

export class FunctionNode extends ASTNode {
  type = "function";
  public nodes: ASTNode[] = [];
  constructor(public name: string) {
    super();
  }

  push(node: ASTNode) {
    captureSource(this, node); // no-op unless a debug.sources pack enabled it
    this.nodes.push(node);
  }
}

export class Range extends ASTNode {
  type = "range";

  //(min) means exactly min
  //(min..max) means min to max inclusive
  //(min..) means min and above
  //(..max) means max and below
  //(undefined..undefined) means all values

  constructor(
    public min?: number,
    public max?: number,
  ) {
    super();
  }

  // Named constructors, so a call site reads as what the range *means* rather
  // than as its punctuation. The same four {@link NumRange} already offers for
  // the numeric-range value; these are their score-range counterparts.

  /** `n` - exactly. */
  static exactly(n: number) {
    return new Range(n, n);
  }
  /** `n..` - at least `n`. */
  static atLeast(n: number) {
    return new Range(n, undefined);
  }
  /** `..n` - at most `n`. */
  static atMost(n: number) {
    return new Range(undefined, n);
  }
  /** `a..b` - inclusive band. */
  static between(a: number, b: number) {
    return new Range(a, b);
  }

  toString() {
    if (this.min !== undefined && this.max !== undefined)
      // An exact value is written bare (`matches 0`), not as a `0..0` range.
      return this.min === this.max ? `${this.min}` : `${this.min}..${this.max}`;
    if (this.min !== undefined) return `${this.min}..`; // min and above
    if (this.max !== undefined) return `..${this.max}`; // max and below
    return `${this.min}..${this.max}`; // all values
  }

  contains(value: number) {
    if (this.min !== undefined && value < this.min) return false;
    if (this.max !== undefined && value > this.max) return false;
    return true;
  }
}

/**
 * "Nearest wins" bands over a sorted ladder of targets: one {@link Range} per
 * target, split at neighbor midpoints, open-ended at both ends. Splits the
 * number line the same way `Selector`'s nearest-of-N patterns do for scores -
 * useful for "snap this score to the nearest of these rungs" dispatch (see
 * {@link FunctionContext.dispatchScore}). Tiling with no gaps is a property of
 * the construction (each band's edges come directly from its neighbors), not
 * something to separately assert.
 */
export function bandsFromTargets(targets: readonly number[]): Range[] {
  const mid = (a: number, b: number) => Math.floor((a + b) / 2);
  return targets.map((t, i) => {
    const from = i === 0 ? undefined : mid(targets[i - 1], t) + 1;
    const upTo = i === targets.length - 1 ? undefined : mid(t, targets[i + 1]);
    return new Range(from, upTo);
  });
}

/**
 * A neutral command part: either a fixed literal token or a deferred argument
 * value. A command builder fills these in as the author chains calls; the arg
 * holds a `CommandValue` concept whose rendering is deferred to codegen (so it
 * can depend on the target version). The command's handler renders the parts
 * into version-validated tokens.
 */
export type CommandPart =
  | { kind: "literal"; value: string }
  | { kind: "arg"; value: CommandValue };

/**
 * Base for every command's AST node. Each command has its OWN node subclass
 * (e.g. `WeatherNode`) with a distinct `type`, so a handler can be registered
 * per command and the heavy commands (give, execute, ...) can carry a richer,
 * hand-modelled shape instead of flat parts. The mechanical commands just
 * accumulate `parts` via their builder.
 */
export abstract class CommandNodeBase extends ASTNode {
  abstract type: string;
  parts: CommandPart[] = [];
}

/**
 * The node every *mechanical* command uses: it is nothing but its command name
 * plus the literal/arg parts its builder accumulated, so one class covers all of
 * them (and one shared `TreeCommandHandler` renders them - see ir/generate).
 * Commands whose lowering is version-dependent keep their own node + handler.
 */
export class TreeCommandNode extends CommandNodeBase {
  constructor(readonly type: string) {
    super();
  }
}
