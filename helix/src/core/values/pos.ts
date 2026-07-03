import { CommandValue } from "./value";

type Mode = "absolute" | "relative" | "local";

/**
 * A coordinate tuple (`block_pos`, `vec3`, `vec2`, `column_pos`). One mode
 * applies to the whole vector:
 *
 *   Pos(10, 4, 5)       -> "10 4 5"     (absolute)
 *   Pos.rel(0, 1, 0)    -> "~ ~1 ~"     (relative, ~)
 *   Pos.local(0, 0, 2)  -> "^ ^ ^2"     (local, ^)
 *   Pos.here()          -> "~ ~ ~"
 */
export class PosValue implements CommandValue {
  constructor(
    private readonly coords: number[],
    private readonly mode: Mode,
  ) {}

  render(): string {
    return this.coords.map((n) => component(n, this.mode)).join(" ");
  }

  /** A new position shifted by `(dx, dy, dz)`, keeping the same mode. */
  offset(dx: number, dy: number, dz: number): PosValue {
    const d = [dx, dy, dz];
    return new PosValue(
      this.coords.map((n, i) => n + (d[i] ?? 0)),
      this.mode,
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
  (...coords: number[]): PosValue => new PosValue(coords, "absolute"),
  {
    /** Relative to the executor (`~`). */
    rel: (...coords: number[]): PosValue => new PosValue(coords, "relative"),
    /** Local, relative to facing (`^`). */
    local: (...coords: number[]): PosValue => new PosValue(coords, "local"),
    /** `~ ~ ~` - the executor's own position. */
    here: (): PosValue => new PosValue([0, 0, 0], "relative"),
    /** Wrap a raw coordinate string (legacy escape hatch); renders verbatim. */
    raw: (text: string): PosValue => new RawPos(text),
  },
);
