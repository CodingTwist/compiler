// The rig and gesture timelines as plain data, for the preview page.
import { add } from "helix";
import type { DisplayValue, Quat, Transform, Vec3 } from "helix";
import { memberPose, type ResolvedGesture } from "../gesture";

/** A mob rig as the game sees it: each member's rest transform, and every write each gesture makes. */
export interface MobPreview {
  tickEvery: number;
  /** The model's group offset - gesture pivots here include it, authored ones don't. */
  offset: Vec3;
  members: { kind: "item" | "block"; id: string; transform: Transform }[];
  gestures: {
    name: string;
    pivot: Vec3;
    members: number[];
    steps: Quat[];
    tilt?: Quat;
    rise: number;
    linger: number;
    fall: number;
    writes: { tick: number; duration: number; poses: Record<number, Transform> }[];
  }[];
}

/** The model and every gesture's pose timeline, resolved to plain transforms. */
export function mobPreview(model: DisplayValue, gestures: ResolvedGesture<string>[], tickEvery: number): MobPreview {
  const members = model.members().map(({ content, transform }) => ({
    kind: content.kind,
    id: content.kind === "item" ? content.item.baseId() : content.block.toBlockState().Name,
    transform,
  }));
  return {
    tickEvery,
    offset: model.getOffset(),
    members,
    gestures: gestures.map((g) => ({
      name: g.name,
      pivot: add(g.pivot, model.getOffset()),
      members: g.members,
      steps: g.steps,
      tilt: g.tilt,
      rise: g.rise,
      linger: g.linger,
      fall: g.fall,
      writes: g.schedule.map((w) => ({
        tick: w.poll * tickEvery,
        duration: w.duration,
        poses: Object.fromEntries(g.members.map((i) => [i, memberPose(model, g, i, w.q)])),
      })),
    })),
  };
}
