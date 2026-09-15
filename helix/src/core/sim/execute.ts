// The `execute` command: context changes, conditions and stores, then `run`.
import { CommandError } from "./compute";
import { holders, one, parsePos, runCommand } from "./commands";
import { getPath, setPath } from "./nbt";
import { select } from "./selector";
import type { Sim } from "./sim";
import { parseRange } from "./tokens";
import type { SimSource } from "./types";

type Store = (result: number, success: boolean) => void;

/** Runs the subcommands in `t` (everything after `execute`). Returns the last branch's result. */
export function execute(sim: Sim, t: string[], src: SimSource, stores: Store[] = []): number {
  const next = (n: number, s: SimSource = src) => execute(sim, t.slice(n), s, stores);
  const finish = (result: number, success: boolean) => {
    for (const store of stores) store(result, success);
    return result;
  };
  if (t.length === 0) return finish(1, true); // every condition passed
  switch (t[0]) {
    case "run":
      try {
        return finish(runCommand(sim, t.slice(1).join(" "), src), true);
      } catch (e) {
        if (!(e instanceof CommandError)) throw e;
        sim.errors.push(`${t.slice(1).join(" ")}: ${e.message}`);
        return finish(0, false);
      }
    case "as": {
      let last = 0;
      for (const e of select(sim.entities, t[1], src)) last = next(2, { ...src, self: e });
      return last;
    }
    case "at": {
      let last = 0;
      for (const e of select(sim.entities, t[1], src)) last = next(2, { ...src, at: [...(e.nbt.Pos as [number, number, number])] });
      return last;
    }
    case "positioned":
      if (t[1] === "as") {
        let last = 0;
        for (const e of select(sim.entities, t[2], src)) last = next(3, { ...src, at: [...(e.nbt.Pos as [number, number, number])] });
        return last;
      }
      return next(4, { ...src, at: parsePos(t.slice(1, 4), src.at) });
    case "align":
      return next(2, { ...src, at: src.at.map((v, i) => (t[1].includes("xyz"[i]) ? Math.floor(v) : v)) as typeof src.at });
    case "if":
    case "unless": {
      const [ok, used] = condition(sim, t, src);
      if (ok !== (t[0] === "if")) return finish(0, false);
      return next(used);
    }
    case "store": {
      const [kind, into] = [t[1], t[2]];
      const pick = (r: number, s: boolean) => (kind === "success" ? +s : r);
      if (into === "score") {
        const targets = holders(sim, t[3], src);
        const store: Store = (r, s) => targets.forEach((h) => sim.setScore(h, t[4], pick(r, s)));
        return execute(sim, t.slice(5), src, [...stores, store]);
      }
      if (into === "storage" || into === "entity") {
        const root = into === "storage" ? sim.storage(t[3]) : one(sim, t[3], src).nbt;
        const [path, type, scale] = [t[4], t[5], +t[6]];
        const store: Store = (r, s) => {
          const v = pick(r, s) * scale;
          setPath(root, path, type === "float" ? Math.fround(v) : type === "double" ? v : Math.trunc(v));
        };
        return execute(sim, t.slice(7), src, [...stores, store]);
      }
      if (into === "bossbar") return execute(sim, t.slice(5), src, stores);
      throw new Error(`unsupported store ${into}`);
    }
    default:
      throw new Error(`unsupported execute subcommand ${t[0]}`);
  }
}

/** Tests an `if`/`unless` clause. Returns whether it holds and how many tokens it used. */
function condition(sim: Sim, t: string[], src: SimSource): [boolean, number] {
  switch (t[1]) {
    case "score": {
      const holder = (arg: string) => (arg.startsWith("@") ? one(sim, arg, src).uuid : arg);
      const a = sim.score(holder(t[2]), t[3]);
      if (t[4] === "matches") return [a !== undefined && parseRange(t[5])(a), 6];
      const b = sim.score(holder(t[5]), t[6]);
      if (a === undefined || b === undefined) return [false, 7];
      const cmp: Record<string, boolean> = { "<": a < b, "<=": a <= b, "=": a === b, ">=": a >= b, ">": a > b };
      return [cmp[t[4]], 7];
    }
    case "entity":
      return [select(sim.entities, t[2], src).length > 0, 3];
    case "block":
      return [sim.blockIs(parsePos(t.slice(2, 5), src.at), t[5]), 6];
    case "data": {
      const root = t[2] === "storage" ? sim.storage(t[3]) : one(sim, t[3], src).nbt;
      return [getPath(root, t[4]) !== undefined, 5];
    }
    default:
      throw new Error(`unsupported condition ${t[1]}`);
  }
}
