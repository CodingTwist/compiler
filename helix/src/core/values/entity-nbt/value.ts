// `EntityNbtValue`: an entity's NBT, rendered from its schema against the target version.
import type { VersionProfile } from "../../../versions/profile";
import { NbtValue, toSnbt } from "../nbt";
import type { NbtInput } from "../nbt";
import type { EntityNbtSchema } from "./define";
import type { FieldEncoder } from "./fields";

const isCompound = (x: unknown): x is Record<string, NbtInput> =>
  typeof x === "object" && x !== null && (x as object).constructor === Object;

/** Merge `from` into `into`, descending into compounds so sibling fields can share one. */
function merge(
  into: Record<string, NbtInput>,
  from: Record<string, NbtInput>,
): Record<string, NbtInput> {
  for (const [key, value] of Object.entries(from)) {
    const current = into[key];
    if (isCompound(current) && isCompound(value)) merge(current, value);
    else into[key] = value;
  }
  return into;
}

/** An entity's NBT, assembled from its schema at codegen against the target version. */
export class EntityNbtValue extends NbtValue {
  // Extends `NbtValue` so it works anywhere SNBT does.
  constructor(
    private readonly schema: Record<string, FieldEncoder<never>>,
    private readonly fields: Record<string, unknown>,
    /** The entity this schema curates, when it names one - `summon` infers the type from it. */
    readonly entity?: string,
    /** Whether to write the entity's own `id` key - see {@link asPassenger}. */
    private readonly withId = false,
  ) {
    super("");
  }

  override render(version: VersionProfile): string {
    const out = renderFields(this.schema, this.fields, version);
    // Last, so a passenger reads as "the NBT, then what it is".
    if (this.withId && this.entity) out.id = this.entity;
    return toSnbt(out, version);
  }

  override keys(version: VersionProfile): string[] {
    return Object.keys(renderFields(this.schema, this.fields, version));
  }

  /** A copy that also writes its own `id`, for nested entities like `Passengers`. */
  asPassenger<T extends EntityNbtValue>(this: T): T {
    return new EntityNbtValue(this.schema, this.fields, this.entity, true) as T;
  }

  /** A copy with extra `Tags` appended, so a caller can find what it summoned. */
  tagged<T extends EntityNbtValue>(this: T, ...names: string[]): T {
    if (!this.schema.tags) {
      throw new Error(
        `${this.entity ?? "This"} entity NBT schema has no \`tags\` field`,
      );
    }
    const tags = [
      ...((this.fields.tags as readonly string[] | undefined) ?? []),
      ...names,
    ];
    return new EntityNbtValue(
      this.schema,
      { ...this.fields, tags },
      this.entity,
      this.withId,
    ) as T;
  }
}

/** A schema's fields as SNBT, in the order the author wrote them. */
export function renderFields(
  schema: Record<string, FieldEncoder<never>>,
  fields: Record<string, unknown>,
  version: VersionProfile,
): Record<string, NbtInput> {
  const out: Record<string, NbtInput> = {};
  for (const [name, value] of Object.entries(fields)) {
    const encode = schema[name];
    if (value === undefined || encode === undefined) continue;
    merge(out, encode(value as never, version));
  }
  return out;
}

/** A field that is itself a typed compound, e.g. `VillagerData`. */
export const nested =
  <F extends object>(schema: EntityNbtSchema<F>) =>
  (value: F, version: VersionProfile): NbtInput =>
    renderFields(
      schema as unknown as Record<string, FieldEncoder<never>>,
      value as Record<string, unknown>,
      version,
    );
