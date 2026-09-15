// What a line can do to entities, following the functions it calls.
import type { Datapack } from "../../ir/datapack";
import { Effect, worst, type LineInfo } from "../../ir/line-info";

/** What a line can do to entities, and whether it stays on `@s`, counting what it calls. */
export interface Reach {
  effect: Effect;
  local: boolean;
}

export type ReachOf = (info: LineInfo) => Reach;

/** Returns the {@link Reach} of a line, following the functions it calls. */
export function reaches(dp: Datapack): ReachOf {
  const memo = new Map<string, Reach>();
  // Depth of each function still being visited, to spot recursion.
  const visiting = new Map<string, number>();

  /** Reach of `name`, and the shallowest visiting function it reached back to. */
  const visit = (name: string): [Reach, number] => {
    const known = memo.get(name);
    if (known) return [known, Infinity];
    const depth = visiting.get(name);
    if (depth !== undefined)
      return [{ effect: Effect.NONE, local: true }, depth];
    const infos = dp.lineInfo.get(name);
    // A call we can't read might do anything.
    if (!infos) return [{ effect: Effect.MOVES, local: false }, Infinity];

    const own = visiting.size;
    visiting.set(name, own);
    let low = Infinity;
    const reach = infos.reduce<Reach>(
      (acc, info) => {
        const [r, l] = combine(info);
        low = Math.min(low, l);
        return {
          effect: worst(acc.effect, r.effect),
          local: acc.local && r.local,
        };
      },
      { effect: Effect.NONE, local: true },
    );
    visiting.delete(name);
    // Inside a loop through a caller, the result is missing that caller's lines.
    if (low >= own) memo.set(name, reach);
    return [reach, low];
  };

  /** A line's own reach joined with its callees'. */
  const combine = (info: LineInfo): [Reach, number] => {
    let reach: Reach = { effect: info.effect, local: info.local };
    let low = Infinity;
    for (const callee of info.calls) {
      const [r, l] = visit(callee);
      reach = {
        effect: worst(reach.effect, r.effect),
        local: reach.local && r.local,
      };
      low = Math.min(low, l);
    }
    return [reach, low];
  };

  return (info) => combine(info)[0];
}
