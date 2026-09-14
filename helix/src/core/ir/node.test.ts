import { describe, it, expect } from "vitest";
import { Range } from "./node";

describe("Range", () => {
  it("renders an exact value bare, not as a min..min range", () => {
    expect(Range.exactly(5).toString()).toBe("5");
  });

  it("renders atLeast/atMost/between with the right side open", () => {
    expect(Range.atLeast(3).toString()).toBe("3..");
    expect(Range.atMost(7).toString()).toBe("..7");
    expect(Range.between(2, 9).toString()).toBe("2..9");
  });

  it("renders an unbounded range (no min or max) as bare '..', not the literal word undefined", () => {
    expect(new Range().toString()).toBe("..");
  });
});
