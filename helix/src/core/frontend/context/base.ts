import { ASTNode, FunctionNode } from "../../ir/node";
import { FunctionRef } from "../../function_ref";
import { VersionProfile } from "../../../versions/profile";
import { PRIVATE_ROOT } from "../../private-fn";

/**
 * The core of FunctionContext: the function being authored, the target version,
 * and the shared plumbing (emit, call, child functions). Every author-facing
 * `ctx.<command>()` method is a prototype augmentation living WITH its command in
 * src/core/commands/<cmd>.ts - none are defined here.
 */
export class ContextBase {
  private suffixCounters = new Map<string, number>();

  constructor(
    // Public so the command files' prototype augmentations (e.g. `player()`)
    // can reach the function being authored; not part of the intended API.
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

  call(node: FunctionRef) {
    this.fn.push(node.node);
  }

  /**
   * A uniquely-named nested function for control-flow bodies (if/elif/else, at).
   * Public so the `if` augmentation in commands/if.ts can build child bodies.
   *
   * Generated helpers live under the shared `PRIVATE_ROOT` folder so they sort
   * *away* from authored functions (a leading-underscore name sorted them to the
   * top of the list, in the way). The name nests by parent path - `tick` →
   * `zzz/tick/if_0` → `zzz/tick/if_0/at_0` - stripping the root from the parent
   * so the prefix doesn't compound into noise on each nesting level.
   */
  createChildFunction(suffix: string): FunctionNode {
    const count = this.suffixCounters.get(suffix) ?? 0;
    this.suffixCounters.set(suffix, count + 1);
    const parent = this.fn.name.startsWith(`${PRIVATE_ROOT}/`)
      ? this.fn.name.slice(PRIVATE_ROOT.length + 1)
      : this.fn.name;
    const name = `${PRIVATE_ROOT}/${parent}/${suffix}_${count}`;
    return new FunctionNode(name);
  }
}
