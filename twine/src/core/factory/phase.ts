// Spreads throttled modules' ticks across their period.
import type { Node } from "../graph";

/**
 * Picks each throttled module's tick phase. Modules sharing a `tickEvery` are spread round-robin so
 * they don't all run on the same tick. An explicit `tickPhase` wins.
 */
export function makePhaseAllocator(): (node: Node) => number {
  const nextPerPeriod = new Map<number, number>();
  const assigned = new Map<Node, number>();
  return (node: Node): number => {
    if (node.meta.tickPhase !== undefined) return node.meta.tickPhase;
    const cached = assigned.get(node);
    if (cached !== undefined) return cached;
    const period = node.meta.tickEvery ?? 1;
    const n = nextPerPeriod.get(period) ?? 0;
    const phase = n % period;
    nextPerPeriod.set(period, n + 1);
    assigned.set(node, phase);
    return phase;
  };
}
