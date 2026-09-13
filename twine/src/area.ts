/** Area geometry: zones a player can stand in, and the triggers that switch an area on. */

import type { Selector } from "helix";

/** A world position / corner: `[x, y, z]`. */
export type Vec3 = [number, number, number];

/**
 * A volume a player can be inside. Several zones in one `zones` trigger form a union.
 *
 * - `sphere`: within `radius` blocks of `center`, in 3D.
 * - `cuboid`: inside the box between corners `from` and `to` (inclusive, any order).
 */
export type Zone =
  | { shape: "sphere"; center: Vec3; radius: number }
  | { shape: "cuboid"; from: Vec3; to: Vec3 };

/**
 * How an `area` switches itself on.
 *
 * - `region`: one sphere.
 * - `cuboid`: one box.
 * - `zones`: a union of spheres and boxes, for irregular areas.
 * - `score`: while `#<target> <objective>` equals a value or is in a range.
 * - `players`: while any player matches a {@link Selector} (tagged, scored, holding
 * something...).
 *
 * Presence triggers (`region`, `cuboid`, `zones`, `players`) turn the area off when nobody
 * matches. `score` latches on until something calls `deactivate`.
 * Areas with no trigger are activated with `/function <ns>:<name>/activate`.
 */
export type AreaTrigger =
  | { kind: "region"; center: Vec3; radius: number }
  | { kind: "cuboid"; from: Vec3; to: Vec3 }
  | { kind: "zones"; zones: Zone[] }
  | PlayersTrigger
  | ScoreTrigger;

/**
 * Activates an area while any player matches {@link selector}.
 *
 * Turns off again once nobody matches, unless `latch: true`.
 */
export interface PlayersTrigger {
  kind: "players";
  selector: Selector;
  /** Default `false`. `true` keeps the area on until `<name>/deactivate`. */
  latch?: boolean;
}

/**
 * Activates an area from a score. Give exactly one of {@link equals} or {@link matches}.
 *
 * Latches on until `<name>/deactivate` by default; `latch: false` turns it off when the
 * score
 * stops matching.
 */
export interface ScoreTrigger {
  kind: "score";
  objective: string;
  target: string;
  /** Activate while the score is exactly this. Mutually exclusive with {@link matches}. */
  equals?: number;
  /** Activate while the score is within this inclusive band; omit a bound to leave it open. */
  matches?: { min?: number; max?: number };
  /** Default `true`. `false` turns the area off once the score stops matching. */
  latch?: boolean;
}
