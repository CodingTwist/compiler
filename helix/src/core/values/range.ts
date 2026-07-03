import { CommandValue } from "./value";

/**
 * A numeric range (`int_range` / `float_range`):
 *
 *   NumRange(1, 5)        -> "1..5"
 *   NumRange.exactly(3)   -> "3"
 *   NumRange.atLeast(1)   -> "1.."
 *   NumRange.atMost(9)    -> "..9"
 */
export class NumRangeValue implements CommandValue {
  constructor(
    private readonly min?: number,
    private readonly max?: number,
  ) {}

  render(): string {
    if (this.min !== undefined && this.max !== undefined) {
      return this.min === this.max ? `${this.min}` : `${this.min}..${this.max}`;
    }
    if (this.min !== undefined) return `${this.min}..`;
    if (this.max !== undefined) return `..${this.max}`;
    return "..";
  }
}

export type NumRange = NumRangeValue;

export const NumRange = Object.assign(
  (min?: number, max?: number): NumRangeValue => new NumRangeValue(min, max),
  {
    exactly: (n: number): NumRangeValue => new NumRangeValue(n, n),
    atLeast: (n: number): NumRangeValue => new NumRangeValue(n, undefined),
    atMost: (n: number): NumRangeValue => new NumRangeValue(undefined, n),
  },
);
