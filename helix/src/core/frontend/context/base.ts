import { ASTNode, FunctionNode } from "../../ir/node";
import { FunctionRef } from "../../function_ref";
import { VersionProfile } from "../../../versions/profile";
import { privateChild } from "../../private-fn";

/**
 * The core of FunctionContext: the function, target version, and emit/call plumbing.
 * Each `ctx.<command>()` is added by its own file in src/core/commands/.
 */
export class ContextBase {
  private suffixCounters = new Map<string, number>();

  constructor(
    // Public so command augmentations can reach it; not intended API.
    public fn: FunctionNode,
    protected _version: VersionProfile,
  ) {}

  /** The target version, so child contexts and helpers can gate on it. */
  get version(): VersionProfile {
    return this._version;
  }

  emit(node: ASTNode) {
    this.fn.push(node);
  }

  /**
   * Removes `node` if it's still the last thing emitted, e.g. an `execute` chain that ended
   * up empty.
   * Does nothing otherwise.
   */
  retract(node: ASTNode): boolean {
    if (this.fn.nodes[this.fn.nodes.length - 1] !== node) return false;
    this.fn.nodes.pop();
    return true;
  }

  call(node: FunctionRef) {
    this.fn.push(node.node);
  }

  /**
   * Creates a uniquely named child function for control-flow bodies.
   *
   * Private and nested under the parent's path: `mace/tick` → `zzzprivate/mace/tick/if_0`.
   */
  createChildFunction(suffix: string): FunctionNode {
    const count = this.suffixCounters.get(suffix) ?? 0;
    this.suffixCounters.set(suffix, count + 1);
    const child = new FunctionNode(
      privateChild(this.fn.name, `${suffix}_${count}`, this.fn.root.layout),
    );
    child.root = this.fn.root;
    return child;
  }
}
