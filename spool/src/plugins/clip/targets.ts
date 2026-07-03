/**
 * What a transform track animates. A display model is a *group* of independent
 * member entities (Minecraft has no transform inheritance between display
 * entities), each tagged `<name>_<i>` and carrying its own base transform. A
 * `ModelTarget` snapshots those bases so a track can compose its motion on top of
 * each member's authored offset - exactly the addressing the old `frames.ts` used.
 */
import { Selector } from "helix";
import type { DisplayValue, Vec3, Quat } from "helix";

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
const UNIT_SCALE: Vec3 = [1, 1, 1];

/** One member of a model target: its selector and authored base transform. */
export interface TransformMember {
  /** `@e[tag=<name>_<i>,limit=1]`. */
  readonly selector: Selector;
  readonly translation: Vec3;
  readonly scale: Vec3;
  readonly leftRotation: Quat;
}

/** A display model resolved to its animatable members + rotation pivot. */
export interface ModelTarget {
  /** The group tag (`@e[tag=<name>]`). */
  readonly name: string;
  readonly members: readonly TransformMember[];
  readonly pivot: Vec3;
}

/**
 * Resolve a named {@link DisplayValue} to a {@link ModelTarget}: one member per
 * root+child, each addressed by `@e[tag=<name>_<i>,limit=1]` with its authored
 * base transform captured as the keyframe origin.
 */
export function modelTarget(model: DisplayValue): ModelTarget {
  const name = model.getName(); // throws if unnamed - required for tag addressing
  const members = model.members().map((m, i): TransformMember => ({
    selector: Selector.allEntities().tag(`${name}_${i}`).limit(1),
    translation: m.transform.translation ?? [0, 0, 0],
    scale: m.transform.scale ?? UNIT_SCALE,
    leftRotation: m.transform.leftRotation ?? IDENTITY_QUAT,
  }));
  return { name, members, pivot: model.getPivot() };
}
