// `defineBlockEntityNbt`: a typed block-entity NBT factory from a field schema.
import { BlockEntityNbtValue } from "./value";
import type { FieldEncoder } from "./fields";

/** One {@link FieldEncoder} per author-facing field of `F`. */
export type BlockEntityNbtSchema<F> = {
  readonly [K in keyof F]-?: FieldEncoder<NonNullable<F[K]>>;
};

/** A {@link BlockEntityNbtValue} whose schema named its block_entity_type. */
export interface IdentifiedBlockEntityNbt extends BlockEntityNbtValue {
  readonly blockEntityType: string;
}

/**
 * Builds a typed block-entity NBT factory from a field schema, for block entities helix
 * doesn't cover:
 *
 *   const Chest = defineBlockEntityNbt<ContainerFields>(CONTAINER27, "minecraft:chest");
 *
 * Schemas for every vanilla block entity live in `block-entities.generated.ts`.
 */
export function defineBlockEntityNbt<F extends object>(
  schema: BlockEntityNbtSchema<F>,
  blockEntityType: string,
): (fields: F) => IdentifiedBlockEntityNbt;
export function defineBlockEntityNbt<F extends object>(
  schema: BlockEntityNbtSchema<F>,
): (fields: F) => BlockEntityNbtValue;
export function defineBlockEntityNbt<F extends object>(
  schema: BlockEntityNbtSchema<F>,
  blockEntityType?: string,
): (fields: F) => BlockEntityNbtValue {
  return (fields) =>
    new BlockEntityNbtValue(
      schema as unknown as Record<string, FieldEncoder<never>>,
      fields as Record<string, unknown>,
      blockEntityType,
    );
}
