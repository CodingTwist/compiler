import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";

/**
 * A resource-location that knows WHICH registry it belongs to. The registry id
 * is a phantom brand on the type parameter `R`, so a `Biome`
 * (`ResourceId<"minecraft:worldgen/biome">`) is NOT interchangeable with an
 * `Enchantment` (`ResourceId<"minecraft:enchantment">`) even though both are
 * resource locations underneath. This is the whole point of Principle 1 in
 * PHILOSOPHY.md: a command slot that wants an enchantment accepts an
 * `Enchantment`, never a bare string or a wrong-registry id.
 *
 * The concrete named types (`Biome`, `Enchantment`, ...) and their factories are
 * GENERATED into `resource.generated.ts` from the command tree's
 * `properties.registry`, so when Minecraft adds/renames a registry the type set
 * tracks it on the next `gen:commands` run - no hand-maintained list.
 *
 *   Biome("plains")        -> "minecraft:plains"
 *   Enchantment("#ns:foo") -> "#ns:foo"   (tag form preserved)
 *
 * Rendering is currently namespace-normalisation only (like `Id`); once a
 * version's `RegistrySet` carries the relevant registry, `render` can validate
 * `id` against `registry` for the target version.
 */
export class ResourceId<R extends string = string> implements CommandValue {
  constructor(
    private readonly id: string,
    /** The registry this id resolves against, e.g. `"minecraft:enchantment"`. */
    readonly registry: R,
  ) {}

  render(): string {
    if (this.id.startsWith("#")) return "#" + normalizeId(this.id.slice(1));
    return normalizeId(this.id);
  }
}
