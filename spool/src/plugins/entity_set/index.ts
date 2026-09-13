import { Datapack, Selector } from "helix";
import type { FunctionContext } from "helix";
import type { KitPlugin } from "../../plugin";

/**
 * A named set of entities tracked by a tag, so you query `@e[tag=…]` instead of scanning
 * all of `@e`.
 *
 * Sets with the same name share members.
 */
export class EntitySet {
  constructor(public readonly name: string) {}

  /** Mark `who` (default `@s`) as a member - call where the entity is summoned. */
  add(ctx: FunctionContext, who: Selector = Selector.self()): void {
    ctx.tag().add(who, this.name);
  }

  /** Drop `who` (default `@s`) from the set. */
  remove(ctx: FunctionContext, who: Selector = Selector.self()): void {
    ctx.tag().remove(who, this.name);
  }

  /** A selector over members only: a bounded `@e[tag=name]`, not a full sweep. */
  all(): Selector {
    return Selector.allEntities().tag(this.name);
  }

  /** The nearest single member (`@e[tag=name,limit=1,sort=nearest]`). */
  nearest(): Selector {
    return Selector.allEntities().tag(this.name).limit(1).sort("nearest");
  }
}

// Declares `dp.entitySet()` for the type checker; the plugin's `install()` adds it at
// runtime.
declare module "helix" {
  interface Datapack {
    /** An {@link EntitySet} for `name`. */
    entitySet(name: string): EntitySet;
  }
}

export const entitySet: KitPlugin = {
  name: "entity_set",
  install() {
    Datapack.prototype.entitySet = function (
      this: Datapack,
      name: string,
    ): EntitySet {
      return new EntitySet(name);
    };
  },
};
