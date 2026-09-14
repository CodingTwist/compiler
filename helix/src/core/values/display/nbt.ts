// Display NBT: one member's transform, a pose update, and the whole group to summon.
import { BlockDisplay, DisplayBase, Interaction, ItemDisplay } from "../entities.generated";
import type { IdentifiedEntityNbt } from "../entity-nbt";
import { Float, NbtInput } from "../nbt";
import { EntityType } from "../resource.generated";
import type { Quat, Vec3 } from "../transform-math";
import type { DisplayChild, DisplayContent, DisplayState, Transform } from "./types";

/** The display entity type for a member's content. */
export const entityFor = (kind: DisplayContent["kind"]): EntityType =>
  kind === "block" ? EntityType.BLOCK_DISPLAY : EntityType.ITEM_DISPLAY;

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
const UNIT_SCALE: Vec3 = [1, 1, 1];

function transformNbt(t: Transform): NbtInput {
  const vec = (v: Vec3 | Quat) => v.map(Float);
  return {
    left_rotation: vec(t.leftRotation ?? IDENTITY_QUAT),
    right_rotation: vec(t.rightRotation ?? IDENTITY_QUAT),
    scale: vec(t.scale ?? UNIT_SCALE),
    translation: vec(t.translation ?? [0, 0, 0]),
  };
}

/**
 * One member's transform as display NBT for `data merge`. `interpolationDuration` 0 snaps.
 * Matches the summon NBT, so a pose from `DisplayValue.members` lands exactly on the
 * original.
 */
export function displayPose(t: Transform, interpolationDuration = 0) {
  return DisplayBase({
    transformation: transformNbt(t),
    startInterpolation: 0,
    interpolationDuration,
  });
}

/**
 * The `block_display` NBT to summon, built through the entity schema.
 * `all` must come from `members()`, so a group `offset` reaches the emitted NBT.
 */
export function groupNbt(all: DisplayChild[], s: DisplayState): IdentifiedEntityNbt {
  const tags = (suffix: string) =>
    s.name ? [s.name, `${s.name}_${suffix}`] : undefined;

  const hitboxNbt = (): IdentifiedEntityNbt[] =>
    s.hitbox
      ? [
          Interaction({
            width: s.hitbox.width,
            height: s.hitbox.height,
            response: s.hitbox.response,
            tags: tags("hitbox"),
          }).asPassenger(),
        ]
      : [];

  const member = (c: DisplayChild, idx: number): IdentifiedEntityNbt => {
    // A passenger names its own entity type; the root's comes from the summon.
    const riders =
      idx === 0 ? [...all.slice(1).map((c, i) => member(c, i + 1)), ...hitboxNbt()] : [];
    const common = {
      transformation: transformNbt(c.transform),
      brightness: s.brightness,
      interpolationDuration: s.interpolation,
      teleportDuration: s.teleportDuration,
      tags: tags(String(idx)),
      passengers: riders.length > 0 ? riders : undefined,
    };
    // Content first, so a block group renders byte-identically to before items existed.
    const nbt =
      c.content.kind === "block"
        ? BlockDisplay({ blockState: c.content.block, ...common })
        : ItemDisplay({
            item: c.content.item.stackNbt(),
            itemDisplay: c.content.context,
            ...common,
          });
    return idx === 0 ? nbt : nbt.asPassenger();
  };
  return member(all[0], 0);
}
