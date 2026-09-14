/**
 * Track kinds. Each compiles to one of:
 *
 * - frame mode: one function per tick of the period. Needed for spins, multi-keyframe paths
 * and
 *   non-display targets.
 * - smooth mode: one native interpolation per member. Only non-spinning transform tracks.
 *
 * A clip can't mix modes; use separate clips or a `Cutscene`.
 */
export type { Track, TrackMode } from "./types";
export { TransformTrack } from "./transform";
export { NbtTrack, type NbtValue } from "./nbt";
export { TpTrack } from "./tp";
