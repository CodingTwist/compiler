// Field encoders: how one camelCase field becomes SNBT keys on a version.
import type { VersionProfile } from "../../../versions/profile";
import { Byte, Double, Float } from "../nbt";
import type { NbtInput } from "../nbt";
import type { ItemValue } from "../item";
// dataVersion for each version the schemas mention. Generated with them.
import { DV } from "../entity-versions.generated";

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
    return {
      [key]: spec.encode ? spec.encode(value, version) : (value as NbtInput),
    };
  };
}

export const asByte = (v: boolean): NbtInput => Byte(v ? 1 : 0);
export const asDoubles = (v: readonly number[]): NbtInput => v.map(Double);
export const asFloats = (v: readonly number[]): NbtInput => v.map(Float);
export const asList = (v: readonly NbtInput[]): NbtInput => [...v];

/** Slot -> item, for the 1.21.5+ `equipment` compound. An {@link Item} goes in whole. */
export type EquipmentInput = Partial<
  Record<
    | "mainhand"
    | "offhand"
    | "head"
    | "chest"
    | "legs"
    | "feet"
    | "body"
    | "saddle",
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

/** A plain-string display name. A JSON string before 1.21.5, a text compound after. */
export const asText = (v: string, version: VersionProfile): NbtInput =>
  atLeast(version, "1.21.5") ? { text: v } : JSON.stringify({ text: v });
