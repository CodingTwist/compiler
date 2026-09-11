import { describe, it, expect } from "vitest";
import { bandsFromTargets } from "./node";

describe("bandsFromTargets", () => {
  it("tiles the number line with no gaps, open-ended at both ends", () => {
    const bands = bandsFromTargets([15, 25, 40, 60, 80, 100]);
    expect(bands.map((b) => [b.min, b.max])).toEqual([
      [undefined, 20],
      [21, 32],
      [33, 50],
      [51, 70],
      [71, 90],
      [91, undefined],
    ]);
  });

  it("a single target covers the whole line", () => {
    const bands = bandsFromTargets([40]);
    expect(bands.map((b) => [b.min, b.max])).toEqual([[undefined, undefined]]);
  });
});
