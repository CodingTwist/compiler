// `defineEntityNbt`: a typed entity NBT factory from a field schema.
import { EntityNbtValue } from "./value";
import type { FieldEncoder } from "./fields";

/** One {@link FieldEncoder} per author-facing field of `F`. */
export type EntityNbtSchema<F> = {
  readonly [K in keyof F]-?: FieldEncoder<NonNullable<F[K]>>;
};

/** An {@link EntityNbtValue} whose schema named its entity, so `summon` can infer the type. */
export interface IdentifiedEntityNbt extends EntityNbtValue {
  readonly entity: string;
}

/**
 * Builds a typed entity NBT factory from a field schema, for entities helix doesn't cover:
 *
 *   const Creeper = defineEntityNbt<MobFields & { fuse?: number }>({
 *     ...MOB,
 *     fuse: field({ key: "Fuse", encode: Short }),
 *   }, "minecraft:creeper");
 *
 * Name the entity so `ctx.summon(Creeper({ fuse: 20 }), pos)` knows its type.
 */
export function defineEntityNbt<F extends object>(
  schema: EntityNbtSchema<F>,
  entity: string,
): (fields: F) => IdentifiedEntityNbt;
export function defineEntityNbt<F extends object>(
  schema: EntityNbtSchema<F>,
): (fields: F) => EntityNbtValue;
export function defineEntityNbt<F extends object>(
  schema: EntityNbtSchema<F>,
  entity?: string,
): (fields: F) => EntityNbtValue {
  return (fields) =>
    new EntityNbtValue(
      schema as unknown as Record<string, FieldEncoder<never>>,
      fields as Record<string, unknown>,
      entity,
    );
}
