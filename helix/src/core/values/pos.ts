import { CommandValue } from "./value";

type Mode = "absolute" | "exact" | "relative" | "local";

/**
 * A single axis pinned to its own mode. Pass one in place of a number to mix
 * modes within a vector (`~ 0 ~`), which vanilla allows per-axis - the only
 * illegal mix is local (`^`) with anything else.
 */
export interface Coord {
  readonly n: number;
  readonly mode: Mode;
}

/** A coordinate as authored: a bare number (the vector's mode) or a {@link Coord}. */
export type CoordArg = number | Coord;

/**
 * A coordinate tuple (`block_pos`, `vec3`, `vec2`, `column_pos`). The factory
 * picks the default mode; any axis may override it:
 *
 *   Pos(10, 4, 5)                 -> "10 4 5"     (absolute)
 *   Pos.rel(0, 1, 0)              -> "~ ~1 ~"     (relative, ~)
 *   Pos.local(0, 0, 2)            -> "^ ^ ^2"     (local, ^)
 *   Pos.here()                    -> "~ ~ ~"
 *   Pos.rel(0, Pos.abs(0), 0)     -> "~ 0 ~"      (mixed)
 */
export class PosValue implements CommandValue {
  private readonly parts: Coord[];

  constructor(coords: CoordArg[], mode: Mode = "absolute") {
    this.parts = coords.map((c) => (typeof c === "number" ? { n: c, mode } : c));
  }

  render(): string {
    return this.parts.map((c) => component(c.n, c.mode)).join(" ");
  }

  /** A new position shifted by `(dx, dy, dz)`, keeping each axis' mode. */
  offset(dx: number, dy: number, dz: number): PosValue {
    const d = [dx, dy, dz];
    return new PosValue(
      this.parts.map((c, i) => ({ n: c.n + (d[i] ?? 0), mode: c.mode })),
    );
  }

  /**
   * A new position at the center of this block cell (+0.5 on each axis). A
   * block_display whose blocks are translated by `-0.5` (centered for rotation)
   * renders its visual center at the entity position, so summoning at a cell's
   * center makes those blocks fill the cell exactly instead of sitting 0.5 low.
   */
  center(): PosValue {
    return this.offset(0.5, 0.5, 0.5);
  }
}

function component(n: number, mode: Mode): string {
  if (mode === "absolute") return String(n);
  // A whole number in a vec3 is block-centered by vanilla (`0` means 0.5 on x/z);
  // the trailing `.0` is what pins it to the exact coordinate.
  if (mode === "exact") return Number.isInteger(n) ? `${n}.0` : String(n);
  const prefix = mode === "relative" ? "~" : "^";
  return n === 0 ? prefix : `${prefix}${n}`;
}

/**
 * A position whose tokens were authored as a raw string (e.g. `"~ ~ ~"`). It
 * renders the text verbatim and is otherwise opaque - `offset` can't shift a
 * vector it never parsed, so it returns itself unchanged. This exists only to
 * coerce the legacy `Pos | string` escape hatch into a real {@link PosValue} at
 * the boundary of the strict command API; new code should build positions with
 * `Pos(...)`, `Pos.rel(...)`, etc.
 */
class RawPos extends PosValue {
  constructor(private readonly text: string) {
    super([], "absolute");
  }
  override render(): string {
    return this.text;
  }
  override offset(): PosValue {
    return this;
  }
  override center(): PosValue {
    return this;
  }
}

export type Pos = PosValue;

export const Pos = Object.assign(
  (...coords: CoordArg[]): PosValue => new PosValue(coords, "absolute"),
  {
    /**
     * Absolute, but pinned to the exact coordinate (`0.0`) rather than the block
     * center vanilla infers from a whole number (`0` -> 0.5 on x/z in a vec3).
     */
    exact: (...coords: CoordArg[]): PosValue => new PosValue(coords, "exact"),
    /** Relative to the executor (`~`). */
    rel: (...coords: CoordArg[]): PosValue => new PosValue(coords, "relative"),
    /** Local, relative to facing (`^`). */
    local: (...coords: CoordArg[]): PosValue => new PosValue(coords, "local"),
    /** `~ ~ ~` - the executor's own position. */
    here: (): PosValue => new PosValue([0, 0, 0], "relative"),
    /** One absolute axis (`0`) inside an otherwise relative/local vector. */
    abs: (n: number): Coord => ({ n, mode: "absolute" }),
    /** One relative axis (`~n`) inside an otherwise absolute vector. */
    tilde: (n: number): Coord => ({ n, mode: "relative" }),
    /** One local axis (`^n`). */
    caret: (n: number): Coord => ({ n, mode: "local" }),
    /** Wrap a raw coordinate string (legacy escape hatch); renders verbatim. */
    raw: (text: string): PosValue => new RawPos(text),
  },
);
