// The generic NBT track: any path on any selector, baked per tick.
import { Float, Nbt, Selector, round6 } from "helix";
import type { FunctionContext, Vec3 } from "helix";
import { lerpVec3, nest, sample, type Keyframe } from "../value";
import type { Track, TrackMode } from "./types";

/** A leaf value a generic NBT track interpolates: a number or a 3-vector. */
export type NbtValue = number | Vec3;

/** Animates any NBT path on any selector over keyframes. Always baked. */
export class NbtTrack implements Track {
  readonly mode: TrackMode = "frame";

  constructor(
    private readonly selector: Selector,
    private readonly path: string,
    private readonly keys: readonly Keyframe<NbtValue>[],
  ) {
    if (keys.length === 0)
      throw new Error("nbt track needs at least one keyframe.");
  }

  empty(): boolean {
    return false;
  }
  length(): number {
    return this.keys[this.keys.length - 1].tick;
  }
  period(duration: number): number {
    return Math.max(1, duration);
  }
  revolution(): undefined {
    return undefined;
  }

  emitFrame(ctx: FunctionContext, f: number): void {
    const v = sample(this.keys, f, mixNbt);
    const leaf =
      typeof v === "number"
        ? Float(round6(v))
        : (v as Vec3).map((n) => Float(round6(n)));
    ctx
      .data()
      .merge()
      .entity(this.selector, Nbt(nest(this.path, leaf)));
  }

  emitSmooth(): void {
    throw new Error("NbtTrack is frame-only.");
  }
}

function mixNbt(a: NbtValue, b: NbtValue, u: number): NbtValue {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  return lerpVec3(a as Vec3, b as Vec3, u);
}
