import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";
import type { VersionProfile } from "../../versions/profile";

/**
 * A resource id typed by its registry, so a `Biome` can't be passed where an `Enchantment`
 * is expected.
 *
 * Named types like `Biome` are generated into `resource.generated.ts` from the command
 * tree.
 *
 *   Biome("plains")        -> "minecraft:plains"
 *   Enchantment("#ns:foo") -> "#ns:foo"   (tag form preserved)
 */
export class ResourceId<R extends string = string> implements CommandValue {
  constructor(
    private readonly id: string,
    /** The registry this id resolves against, e.g. `"minecraft:enchantment"`. */
    readonly registry: R,
  ) {}

  // `version` is unused here but declared so subclasses like `ParticleOptionsValue` can use
  // it.
  render(_version?: VersionProfile): string {
    if (this.id.startsWith("#")) return "#" + normalizeId(this.id.slice(1));
    return normalizeId(this.id);
  }
}
