// Base AST node classes. Each command's own node lives with its handler in
// src/core/commands/.
import { CommandValue } from "../values/value";
import { captureSource } from "../debug/sources";
import type { Effect } from "./line-info";

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

  // Named constructors, so call sites read as meaning rather than punctuation.

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
 * "Nearest wins" ranges for sorted `targets`: split at midpoints, open at both ends.
 * For snapping a score to the nearest value with {@link FunctionContext.dispatchScore}.
 */
export function bandsFromTargets(targets: readonly number[]): Range[] {
  const mid = (a: number, b: number) => Math.floor((a + b) / 2);
  return targets.map((t, i) => {
    const from = i === 0 ? undefined : mid(targets[i - 1], t) + 1;
    const upTo = i === targets.length - 1 ? undefined : mid(t, targets[i + 1]);
    return new Range(from, upTo);
  });
}

/** A command part: a literal token or an argument rendered later for the target version. */
export type CommandPart =
  | { kind: "literal"; value: string }
  | { kind: "arg"; value: CommandValue };

/**
 * Base for every command node. Each command has its own subclass so it can have its own
 * handler.
 */
export abstract class CommandNodeBase extends ASTNode {
  abstract type: string;
  parts: CommandPart[] = [];
}

/**
 * The node for every generated command: a name plus parts, rendered by
 * `TreeCommandHandler`.
 */
export class TreeCommandNode extends CommandNodeBase {
  /**
   * @param effect What the command can do to entities, for output passes.
   * @param exits Whether the command returns from its function.
   */
  constructor(
    readonly type: string,
    readonly effect: Effect,
    readonly exits = false,
  ) {
    super();
  }
}
