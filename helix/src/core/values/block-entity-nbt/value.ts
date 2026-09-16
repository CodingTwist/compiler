// `BlockEntityNbtValue`: a block entity's NBT, rendered from its schema against the target
// version. Mirrors `EntityNbtValue`, minus the entity-only `asPassenger`/`tagged` concepts.
import type { VersionProfile } from "../../../versions/profile";
import { NbtValue, toSnbt } from "../nbt";
import { renderFields } from "../entity-nbt";
import type { FieldEncoder } from "./fields";

/** A block entity's NBT, assembled from its schema at codegen against the target version. */
export class BlockEntityNbtValue extends NbtValue {
  // Extends `NbtValue` so it works anywhere SNBT does (e.g. `BlockValue.data(...)`).
  constructor(
    private readonly schema: Record<string, FieldEncoder<never>>,
    private readonly fields: Record<string, unknown>,
    /** The block_entity_type this schema curates, when it names one. */
    readonly blockEntityType?: string,
  ) {
    super("");
  }

  override render(version: VersionProfile): string {
    return toSnbt(renderFields(this.schema, this.fields, version), version);
  }

  override keys(version: VersionProfile): string[] {
    return Object.keys(renderFields(this.schema, this.fields, version));
  }
}
