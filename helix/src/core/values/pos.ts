import { CommandValue } from "./value";

type Mode = "absolute" | "exact" | "relative" | "local";

/**
 * One axis with its own mode, for mixing modes within a vector (`~ 0 ~`). Local `^` can't
 * be mixed.
 */
export interface Coord {
  readonly n: number;
  readonly mode: Mode;
}

/** A coordinate as authored: a bare number (the vector's mode) or a {@link Coord}. */
export type CoordArg = number | Coord;

/**
 * A coordinate tuple. The factory sets the default mode; any axis can override it:
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

  /** A position names a block or spot every entity shares. */
  reach(): "world" {
    return "world";
  }

  /** The numeric coordinates. Throws unless every axis is absolute. */
  coords(): [number, number, number] {
    if (this.parts.length !== 3 || this.parts.some((c) => c.mode !== "absolute" && c.mode !== "exact")) {
      throw new Error(`Pos "${this.render()}" has no absolute coordinates`);
    }
    return this.parts.map((c) => c.n) as [number, number, number];
  }

  /** A new position shifted by `(dx, dy, dz)`, keeping each axis' mode. */
  offset(dx: number, dy: number, dz: number): PosValue {
    const d = [dx, dy, dz];
    return new PosValue(
      this.parts.map((c, i) => ({ n: c.n + (d[i] ?? 0), mode: c.mode })),
    );
  }

  /**
   * This position plus 0.5 on each axis: the centre of the block.
   * Centred block displays (translated -0.5) fill the cell exactly when summoned here.
   */
  center(): PosValue {
    return this.offset(0.5, 0.5, 0.5);
  }
}

function component(n: number, mode: Mode): string {
  if (mode === "absolute") return String(n);
  // Vanilla centres whole numbers in a vec3 (`0` means 0.5), so add `.0` to pin it.
  if (mode === "exact") return Number.isInteger(n) ? `${n}.0` : String(n);
  const prefix = mode === "relative" ? "~" : "^";
  return n === 0 ? prefix : `${prefix}${n}`;
}

/**
 * A position from a raw string, rendered as-is. `offset` can't shift it.
 * Only for the legacy `Pos | string` inputs; use `Pos(...)` in new code.
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
    /** Absolute, pinned to the exact coordinate (`0.0`) instead of the block centre. */
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
