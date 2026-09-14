import { IdValue } from "./id";
import type { VersionProfile } from "../../versions/profile";

/**
 * A resource id typed by its registry, so a `Biome` can't be passed where an `Enchantment`
 * is expected.
 *
 * Named types like `Biome` are generated into `resource.generated.ts` from the command
 * tree. It is still an {@link IdValue}, so `Dimension.THE_END` works wherever an `Id` does.
 *
 *   Biome("plains")        -> "minecraft:plains"
 *   Enchantment("#ns:foo") -> "#ns:foo"   (tag form preserved)
 */
export class ResourceId<R extends string = string> extends IdValue {
  constructor(
    id: string,
    /** The registry this id resolves against, e.g. `"minecraft:enchantment"`. */
    readonly registry: R,
  ) {
    super(id);
  }

  // `version` is unused here but declared so subclasses like `ParticleOptionsValue` can use
  // it.
  render(_version?: VersionProfile): string {
    return super.render();
  }
}
