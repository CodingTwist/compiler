/**
 * The geometry an `area` module is defined over: world coordinates, the zones a
 * player can stand inside, and the triggers that switch an area on. Kept separate
 * from the module lifecycle contract in {@link ./module.interface}.
 */

import type { Selector } from "helix";

/** A world position / corner: `[x, y, z]`. */
export type Vec3 = [number, number, number];

/**
 * A single volume a player can be inside. Combine many into one area's bounds via
 * the `zones` trigger (a player is "in" the area if inside ANY zone).
 *
 * - `sphere` - within `radius` blocks of `center` (`@a[distance=..radius]`,
 *   measured in 3D, so height counts).
 * - `cuboid` - inside the axis-aligned box spanning the two corners `from`/`to`
 *   (inclusive, order-independent; an `@a[x=…,dx=…,…]` volume selector).
 */
export type Zone =
  | { shape: "sphere"; center: Vec3; radius: number }
  | { shape: "cuboid"; from: Vec3; to: Vec3 };

/**
 * Declares how an `area` switches itself on. The factory emits a cheap per-tick
 * detector for the area; presence triggers (`region`/`cuboid`/`zones`) are
 * tracked both ways - the area turns on while a player is inside and off once the
 * region empties - while `score` latches on until something calls `deactivate`.
 *
 * - `region` - a single sphere: shorthand for one `sphere` {@link Zone}.
 * - `cuboid` - a single axis-aligned box between two corners.
 * - `zones` - a **union** of any number of spheres/boxes; a player anywhere
 *   inside the union counts. Use this to fence off an irregular area out of
 *   several boxes, or to cover several rooms with one flag.
 * - `score` - activate while `#<target> <objective>` matches a value (`equals`)
 *   or a band of values (`matches`), driving areas from your own scoreboard
 *   state rather than from geometry. Two areas can share coordinates and still
 *   be mutually exclusive, because what separates them is the score, not space.
 * - `players` - activate while **any** player matches a {@link Selector}. The
 *   membership form of a presence trigger: where `zones` asks "is anyone in this
 *   space", this asks "is anyone in this *set*" - tagged, scored, holding
 *   something, in a given gamemode. Use it when what defines the area is a
 *   condition the pack maintains per player rather than the player's position.
 *
 * Areas with no trigger are activated manually (`/function <ns>:<name>/activate`)
 * or by another module.
 */
export type AreaTrigger =
  | { kind: "region"; center: Vec3; radius: number }
  | { kind: "cuboid"; from: Vec3; to: Vec3 }
  | { kind: "zones"; zones: Zone[] }
  | PlayersTrigger
  | ScoreTrigger;

/**
 * Activate an area while any player matches {@link selector}.
 *
 * Tracks both ways by default, like the geometric presence triggers: the area
 * switches on as the set becomes non-empty and off again once it empties. Set
 * `latch: true` for the score-trigger behaviour instead - on once, then held
 * until something calls `<name>/deactivate`.
 */
export interface PlayersTrigger {
  kind: "players";
  selector: Selector;
  /** Default `false` (track both ways). `true` holds the area on once armed. */
  latch?: boolean;
}

/**
 * Activate an area from a scoreboard value. Give exactly one of {@link equals}
 * (a single value) or {@link matches} (an inclusive band, either bound open).
 *
 * By default a score trigger **latches**: it switches the area on and leaves it
 * on until something calls `<name>/deactivate`. Set `latch: false` to have it
 * track the score both ways, deactivating as soon as the score stops matching -
 * the score-space equivalent of a player leaving a presence region.
 */
export interface ScoreTrigger {
  kind: "score";
  objective: string;
  target: string;
  /** Activate while the score is exactly this. Mutually exclusive with {@link matches}. */
  equals?: number;
  /** Activate while the score is within this inclusive band; omit a bound to leave it open. */
  matches?: { min?: number; max?: number };
  /** Default `true`. `false` deactivates the area once the score stops matching. */
  latch?: boolean;
}
