import { describe, expect, it } from "vitest";
import { makePhaseAllocator } from "../src/core/factory/phase";
import type { Node } from "../src/core/graph";

const node = (): Node => ({ meta: {} }) as unknown as Node;

describe("makePhaseAllocator", () => {
  it("keeps harmonic periods off each other's ticks", () => {
    const phaseOf = makePhaseAllocator();
    const gates = [20, 10, 5, 2].map((p) => [p, phaseOf(node(), p)] as const);
    for (let t = 0; t < 20; t++) {
      const firing = gates.filter(([p, ph]) => t % p === ph).length;
      // 2 fires on half the ticks, so it must share some; the rest never stack.
      expect(firing).toBeLessThanOrEqual(2);
    }
  });

  it("round-robins same-period modules and reuses a module's phase", () => {
    const phaseOf = makePhaseAllocator();
    const [a, b] = [node(), node()];
    expect([phaseOf(a, 20), phaseOf(b, 20)]).toEqual([0, 1]);
    expect(phaseOf(a, 20)).toBe(0);
  });

  it("uses explicit phases as-is", () => {
    const phaseOf = makePhaseAllocator();
    expect(phaseOf(node(), 20, 3)).toBe(3);
    expect(phaseOf(node(), 20, -1)).toBe(19);
  });
});
