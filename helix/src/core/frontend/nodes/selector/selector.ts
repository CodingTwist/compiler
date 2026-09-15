// `Selector`: the typed entity selector (`@a`, `@e[type=…,tag=…]`), rendered per version.
import { FunctionNode } from "../../../ir/node";
import { ExecuteAsNode } from "../../../commands/execute_as";
import {
  SelectorBase,
  SelectorNode,
  renderSelector,
} from "../../../commands/selector";
import { FunctionContext } from "../../context";
import { runInContext } from "../../context/ambient";
import { VersionProfile } from "../../../../versions/profile";
import { SelectorFilters } from "./filters";

export class Selector extends SelectorFilters {
  static allPlayers(): Selector {
    return new Selector(SelectorBase.ALL_PLAYERS);
  }
  static allEntities(): Selector {
    return new Selector(SelectorBase.ALL_ENTITIES);
  }
  static nearest(): Selector {
    return new Selector(SelectorBase.NEAREST_PLAYER);
  }
  static random(): Selector {
    return new Selector(SelectorBase.RANDOM_PLAYER);
  }
  static self(): Selector {
    return new Selector(SelectorBase.SELF);
  }
  /** A selector that is a bare entity UUID or player name (its own base form). */
  static uuid(id: string): Selector {
    return new Selector(id);
  }

  build(): SelectorNode {
    return new SelectorNode(
      this.base,
      this.scores,
      this.tags,
      this.limitValue,
      this.sortValue,
      this.teamValue,
      this.nameValue,
      this.volumeBox,
      this.distanceRange,
      this.nbtValue,
      this.predicateIds,
      this.xRotationRange,
      this.yRotationRange,
      this.gamemodeValue,
      this.entityTypeValue,
      this.yBandValue,
      this.notGamemodes,
      this.originValue,
    );
  }

  /** The selector as text, so it can be passed to any command method. */
  toString(): string {
    return renderSelector(this.build());
  }

  /** `self` for `@s`, whatever its filters, since it can only pick the executor. */
  reach(): "self" | "world" {
    return this.base === SelectorBase.SELF ? "self" : "world";
  }

  /** Renders for a version, since an `nbt={…}` filter is version-dependent. */
  render(version?: VersionProfile): string {
    return renderSelector(this.build(), version);
  }

  run(fn: (ctx: FunctionContext) => void): (ctx: FunctionContext) => void {
    return (ctx: FunctionContext) => {
      // build a scratch function to capture the inner commands
      const inner = new FunctionNode(`__execute_as`);
      inner.root = ctx.fn.root;
      const innerCtx = new FunctionContext(inner, ctx.version);
      runInContext(innerCtx, fn);

      // each inner node gets wrapped in execute as
      for (const node of inner.nodes) {
        ctx.emit(new ExecuteAsNode(this.build(), node));
      }
    };
  }
}
