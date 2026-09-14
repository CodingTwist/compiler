// Selector argument shapes: a score filter and an axis-aligned volume.
import { Range } from "../../../ir/node";
import { Objective } from "../objective";

export class SelectorScore {
  constructor(
    public readonly objective: Objective,
    public readonly range: Range,
  ) {}

  toString(): string {
    return `${this.objective.objective}=${this.range}`;
  }
}

/**
 * An axis-aligned selector volume: lower corner `x/y/z` (default: execution position) plus
 * `dx/dy/dz`.
 */
export interface SelectorVolume {
  x?: number;
  y?: number;
  z?: number;
  dx: number;
  dy: number;
  dz: number;
}
