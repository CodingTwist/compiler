// The AST node vocabulary: the base classes every node extends. These are the
// IR's shared kernel (not tied to any one command), so they live in ir/ rather
// than a folder of their own. Each command's concrete node lives WITH its
// handler in src/core/commands/<cmd>.ts.
import { CommandValue } from "../values/value";

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
