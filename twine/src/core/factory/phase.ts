// Spreads throttled ticks across their period.
import type { Node } from "../graph";

/** Picks a tick phase for a module's work at a given period. */
export type PhaseOf = (node: Node, period: number, explicit?: number) => number;

/**
 * Picks phases so throttled work lands on the least busy ticks, across all periods.
 *
 * Two gates `(p, a)` and `(q, b)` fire together on `1/lcm(p, q)` of ticks when
 * `a ≡ b (mod gcd(p, q))`, so each new gate takes the phase with the least overlap. Periods
 * like 2/5/10/20 would otherwise all fire on tick 0. An explicit phase wins but still counts
 * as load. One phase per (module, period), so a module's same-period work shares one check.
 */
export function makePhaseAllocator(): PhaseOf {
  const gates: { period: number; phase: number }[] = [];
  const assigned = new Map<string, number>();
  const ids = new Map<Node, number>();
  return (node, period, explicit) => {
    if (period <= 1) return 0;
    if (!ids.has(node)) ids.set(node, ids.size);
    const key = `${ids.get(node)}:${period}:${explicit ?? ""}`;
    const cached = assigned.get(key);
    if (cached !== undefined) return cached;

    let phase =
      explicit === undefined ? 0 : ((explicit % period) + period) % period;
    if (explicit === undefined) {
      let best = Infinity;
      for (let a = 0; a < period; a++) {
        const overlap = gates.reduce((sum, g) => {
          const d = gcd(period, g.period);
          return (a - g.phase) % d === 0 ? sum + d / (period * g.period) : sum;
        }, 0);
        if (overlap < best) [best, phase] = [overlap, a];
      }
    }
    gates.push({ period, phase });
    assigned.set(key, phase);
    return phase;
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
