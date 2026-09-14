// The context-shift half of an `execute` chain: who, where and facing which way.
import { FunctionContext } from "../../frontend/context";
import { Selector } from "../../frontend/nodes/selector";
import { EntityAnchor, Id, Pos, Relation, Swizzle } from "../../values";
import type { Clause, ExecuteNode } from "./types";

/** Context-shift clauses of {@link ExecuteBuilder}; each adds a clause and returns the chain. */
export class ExecuteShifts {
  constructor(
    protected readonly ctx: FunctionContext,
    protected readonly node: ExecuteNode,
  ) {}

  /**
   * Number of clauses added so far, so composed chains can tell "no conditions" from
   * "some".
   */
  get clauseCount(): number {
    return this.node.clauses.length;
  }

  protected push(clause: Clause): this {
    this.node.clauses.push(clause);
    return this;
  }

  as(sel: Selector): this {
    return this.push({ k: "as", sel });
  }
  at(sel: Selector): this {
    return this.push({ k: "at", sel });
  }
  in(dim: Id): this {
    return this.push({ k: "in", dim });
  }
  positioned(pos: Pos): this {
    return this.push({ k: "positioned", pos });
  }
  positionedAs(sel: Selector): this {
    return this.push({ k: "positionedAs", sel });
  }
  /** `rotated <yaw> <pitch>` - e.g. `Pos.rel(0, Pos.abs(0))` keeps yaw, levels pitch. */
  rotated(rot: Pos): this {
    return this.push({ k: "rotated", rot });
  }
  rotatedAs(sel: Selector): this {
    return this.push({ k: "rotatedAs", sel });
  }
  /** `facing <pos>` - rotate so `^`-local coords aim at `pos`. */
  facing(pos: Pos): this {
    return this.push({ k: "facing", pos });
  }
  /** `facing entity <sel> eyes|feet` - rotate so `^`-local coords aim at the entity. */
  facingEntity(sel: Selector, anchor: EntityAnchor = EntityAnchor.FEET): this {
    return this.push({ k: "facingEntity", sel, anchor });
  }
  /** `anchored eyes|feet` - which point on the executor `^`-local coords pivot on. */
  anchored(anchor: EntityAnchor): this {
    return this.push({ k: "anchored", anchor });
  }
  /**
   * `on <relation>`: switch the executor to a related entity (target, vehicle, owner…)
   * without moving.
   *
   * If there's no such entity the chain does nothing, so `on target` also tests "is it
   * fighting?".
   */
  on(relation: Relation): this {
    return this.push({ k: "on", relation });
  }
  /** `align <axes>` - snap the position to the block grid on those axes (e.g. "xyz"). */
  align(axes: Swizzle): this {
    return this.push({ k: "align", axes });
  }
}
