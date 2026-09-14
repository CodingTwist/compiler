import type { VersionProfile } from "../../versions/profile";
import { Byte, Double, Float, NbtValue, toSnbt } from "./nbt";
import type { NbtInput } from "./nbt";
import type { ItemValue } from "./item";
// dataVersion for each version the schemas mention. Generated with them.
import { DV } from "./entity-versions.generated";

/**
 * Typed entity NBT per entity type:
 *
 *   Tnt({ fuse: 40, blockState: Block.SAND, motion: [0, 1, 0] })
 *     // 1.21.4 -> {fuse:40s,block_state:{Name:"minecraft:sand"},Motion:[0.0d,1.0d,0.0d]}
 *     // 1.20.1 -> {Fuse:40s,Motion:[0.0d,1.0d,0.0d]}   (no block_state before 1.20.3)
 *
 * Fields are camelCase; helix handles keys, SNBT types and version changes. No raw-key
 * escape
 * hatch: fix missing fields in `scripts/gen-entity-nbt.mjs`. Schemas are in `entities.ts`.
 */

export type McVersion = keyof typeof DV;

export const atLeast = (version: VersionProfile, at: McVersion): boolean =>
  version.dataVersion >= DV[at];

/**
 * How one field becomes SNBT keys on a version. Returns a record so a field can be absent
 * or
 * write into a shared compound.
 */
export type FieldEncoder<T> = (
  value: T,
  version: VersionProfile,
) => Record<string, NbtInput>;

/** The ordinary field: one key, optionally renamed at or introduced at a version. */
export function field<T>(spec: {
  /** The modern vanilla key. */
  key: string;
  /** JS value -> NBT value. Defaults to passing the value straight through. */
  encode?: (value: T, version: VersionProfile) => NbtInput;
  /** The older spelling, used on versions before `until`. */
  was?: { key: string; until: McVersion };
  /** The field does not exist before this version, and is dropped rather than emitted. */
  since?: McVersion;
  /** The field was removed at this version, and is dropped from it on. */
  until?: McVersion;
}): FieldEncoder<T> {
  return (value, version) => {
    if (spec.since !== undefined && !atLeast(version, spec.since)) return {};
    if (spec.until !== undefined && atLeast(version, spec.until)) return {};
    const key =
      spec.was !== undefined && !atLeast(version, spec.was.until)
        ? spec.was.key
        : spec.key;
    return { [key]: spec.encode ? spec.encode(value, version) : (value as NbtInput) };
  };
}

export const asByte = (v: boolean): NbtInput => Byte(v ? 1 : 0);
export const asDoubles = (v: readonly number[]): NbtInput => v.map(Double);
export const asFloats = (v: readonly number[]): NbtInput => v.map(Float);
export const asList = (v: readonly NbtInput[]): NbtInput => [...v];

/** A plain-string display name. A JSON string before 1.21.5, a text compound after. */
/** Slot -> item, for the 1.21.5+ `equipment` compound. An {@link Item} goes in whole. */
export type EquipmentInput = Partial<
  Record<
    "mainhand" | "offhand" | "head" | "chest" | "legs" | "feet" | "body" | "saddle",
    ItemValue | NbtInput
  >
>;

export const asEquipment = (v: EquipmentInput): NbtInput =>
  Object.fromEntries(
    Object.entries(v).map(([slot, item]) => [
      slot,
      // Duck-typed so this file doesn't import the whole item graph.
      typeof (item as ItemValue)?.stackNbt === "function"
        ? (item as ItemValue).stackNbt()
        : (item as NbtInput),
    ]),
  );

export const asText = (v: string, version: VersionProfile): NbtInput =>
  atLeast(version, "1.21.5") ? { text: v } : JSON.stringify({ text: v });

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
      throw new Error(`${this.entity ?? "This"} entity NBT schema has no \`tags\` field`);
    }
    const tags = [...((this.fields.tags as readonly string[] | undefined) ?? []), ...names];
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
