import { Datapack, Selector } from "helix";
import type { FunctionContext } from "helix";
import type { KitPlugin } from "../../plugin";

/**
 * A named set of entities tracked by an entity **tag**. The point is lag: a bare
 * `@e` selector iterates every loaded entity every time it runs - the single
 * biggest source of datapack tick cost. Registering the entities you care about
 * under a tag and querying `set.all()` turns that into a bounded `@e[tag=…]`
 * scan, which the per-tick cost report (`dp.report()`) recognises as narrowed and
 * does not flag.
 *
 * The tag id is the set name, so two `EntitySet`s with the same name address the
 * same membership - identity is the name, not the instance.
 *
 * (Named `EntitySet`, not "registry", to stay clear of helix's `dp.registryFile`
 * and the registry data-resource concept - this is purely an entity-tag set.)
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

// Importing this module surfaces `dp.entitySet()` to the type-checker; the runtime
// method is installed when the `entitySet` plugin's `install()` runs.
declare module "helix" {
  interface Datapack {
    /**
     * An {@link EntitySet} for `name`: register entities under a tag and query
     * the small tagged set instead of scanning `@e`. Pairs with `dp.report()`,
     * which flags the unbounded scans this is meant to replace.
     */
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
