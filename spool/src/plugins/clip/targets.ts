/**
 * The members of a display model a transform track animates.
 *
 * Display entities don't inherit transforms, so each member (`<name>_<i>`) keeps its own
 * base
 * transform and motion is added on top.
 */
import type { DisplayValue, Selector, Vec3, Quat } from "helix";

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
const UNIT_SCALE: Vec3 = [1, 1, 1];

/** One member of a model target: its selector and authored base transform. */
export interface TransformMember {
  /** `@e[type=<display>,tag=<name>_<i>,limit=1]`. */
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

/** Resolves a {@link DisplayValue} to its members, each with its base transform. */
export function modelTarget(model: DisplayValue): ModelTarget {
  const name = model.getName(); // throws if unnamed - required for tag addressing
  const members = model.members().map(
    (m, i): TransformMember => ({
      // A getter, so an `.at()` set after the clip is made still narrows the selector.
      get selector() {
        return model.memberSelector(i).limit(1);
      },
      translation: m.transform.translation ?? [0, 0, 0],
      scale: m.transform.scale ?? UNIT_SCALE,
      leftRotation: m.transform.leftRotation ?? IDENTITY_QUAT,
    }),
  );
  return { name, members, pivot: model.getPivot() };
}
