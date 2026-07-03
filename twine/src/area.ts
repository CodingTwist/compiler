/**
 * The geometry an `area` module is defined over: world coordinates, the zones a
 * player can stand inside, and the triggers that switch an area on. Kept separate
 * from the module lifecycle contract in {@link ./module.interface}.
 */

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
 * - `score` - activate when `#<target> <objective>` equals `equals`
 *   (drive levels/quests from your own scoreboard state).
 *
 * Areas with no trigger are activated manually (`/function <ns>:<name>/activate`)
 * or by another module.
 */
export type AreaTrigger =
  | { kind: "region"; center: Vec3; radius: number }
  | { kind: "cuboid"; from: Vec3; to: Vec3 }
  | { kind: "zones"; zones: Zone[] }
  | { kind: "score"; objective: string; target: string; equals: number };
