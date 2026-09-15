// Runs one command line against the simulator. Returns the command's result value.
import { CommandError, evalFloat, evalInt } from "./compute";
import { execute } from "./execute";
import { data } from "./data";
import { getPath, parseSnbt, type Compound } from "./nbt";
import { select } from "./selector";
import type { Sim } from "./sim";
import { splitArgs } from "./tokens";
import type { SimEntity, SimSource, V3 } from "./types";

/** Thrown by `return` to end the running function with a value. */
export class Return {
  constructor(readonly value: number) {}
}

const fail = (why: string): never => {
  throw new CommandError(why);
};

/** Reads `~ ~1 5` relative to the source position. Local `^` coordinates aren't supported. */
export function parsePos(t: string[], at: V3): V3 {
  return [0, 1, 2].map((i) => {
    if (t[i].startsWith("^")) throw new Error(`unsupported local coordinates ${t.join(" ")}`);
    return t[i].startsWith("~") ? at[i] + +(t[i].slice(1) || 0) : +t[i];
  }) as V3;
}

/** The score holders a holder argument names: `@s`, a selector, or a fake player. */
export function holders(sim: Sim, arg: string, src: SimSource): string[] {
  return arg.startsWith("@") ? select(sim.entities, arg, src).map((e) => e.uuid) : [arg];
}

/** The one entity a target argument must pick. */
export function one(sim: Sim, arg: string, src: SimSource): SimEntity {
  const found = select(sim.entities, arg, src);
  return found.length === 1 ? found[0] : fail(`expected one entity for ${arg}, got ${found.length}`);
}

export function runCommand(sim: Sim, line: string, src: SimSource): number {
  const t = splitArgs(line);
  switch (t[0]) {
    case "function":
      return sim.call(t[1], src);
    case "return":
      if (t[1] === "run") throw new Return(runCommand(sim, t.slice(2).join(" "), src));
      if (t[1] === "fail") throw new Return(0);
      throw new Return(+t[1]);
    case "execute":
      return execute(sim, t.slice(1), src);
    case "scoreboard":
      return scoreboard(sim, t, src);
    case "tag": {
      const targets = select(sim.entities, t[1], src);
      for (const e of targets) {
        if (t[2] === "add") e.tags.add(t[3]);
        else e.tags.delete(t[3]);
      }
      return targets.length;
    }
    case "data":
      return data(sim, t, src);
    case "summon": {
      const pos = t.length > 2 ? parsePos(t.slice(2, 5), src.at) : src.at;
      sim.summon(t[1], pos, t[5] ? (parseSnbt(t[5]) as Compound) : {});
      return 1;
    }
    case "kill": {
      const targets = select(sim.entities, t[1] ?? "@s", src);
      targets.forEach((e) => sim.kill(e));
      return targets.length;
    }
    case "compute": {
      if (t[1] !== "default") throw new Error(`unsupported: ${line}`);
      const source = computeSource(sim, src);
      if (t[2] === "integer") return evalInt(JSON.parse(t[3]), source);
      const v = evalFloat(JSON.parse(t[3]), source) * Math.fround(t[4] === undefined ? 1 : +t[4]);
      return Number.isFinite(v) ? Math.floor(Math.fround(v)) : fail(`not finite: ${v}`);
    }
    case "say":
    case "tellraw":
      return 1;
    default:
      throw new Error(`unsupported command: ${line}`);
  }
}

const computeSource = (sim: Sim, src: SimSource) => ({
  score: (holder: string | null, objective: string) =>
    holder === null ? (src.self ? sim.score(src.self.uuid, objective) : undefined) : sim.score(holder, objective),
  storage: (id: string, path: string) => {
    const v = getPath(sim.storage(id), path);
    return typeof v === "number" ? v : undefined;
  },
});

function scoreboard(sim: Sim, t: string[], src: SimSource): number {
  if (t[1] === "objectives") return 0; // objectives aren't tracked: any name works
  const [verb, holder, objective] = [t[2], t[3], t[4]];
  const targets = holders(sim, holder, src);
  const int = (v: number) => (v | 0);
  let last = 0;
  for (const h of targets) {
    const cur = sim.score(h, objective) ?? 0;
    switch (verb) {
      case "set":
        sim.setScore(h, objective, (last = +t[5]));
        break;
      case "add":
        sim.setScore(h, objective, (last = int(cur + +t[5])));
        break;
      case "remove":
        sim.setScore(h, objective, (last = int(cur - +t[5])));
        break;
      case "reset":
        sim.resetScore(h, objective);
        break;
      case "get":
        return sim.score(h, objective) ?? fail(`no score ${objective} for ${holder}`);
      case "operation":
        for (const s of holders(sim, t[6], src)) {
          const a = sim.score(h, objective) ?? 0;
          const b = sim.score(s, t[7]) ?? 0;
          const ops: Record<string, () => number | undefined> = {
            "=": () => b,
            "+=": () => int(a + b),
            "-=": () => int(a - b),
            "*=": () => Math.imul(a, b),
            "/=": () => (b === 0 ? undefined : int(Math.floor(a / b))),
            "%=": () => (b === 0 ? undefined : a - Math.floor(a / b) * b),
            "<": () => Math.min(a, b),
            ">": () => Math.max(a, b),
            "><": () => (sim.setScore(s, t[7], a), b),
          };
          if (!ops[t[5]]) throw new Error(`unsupported operation ${t[5]}`);
          const r = ops[t[5]]() ?? a;
          sim.setScore(h, objective, (last = r));
        }
        break;
      default:
        throw new Error(`unsupported: ${t.join(" ")}`);
    }
  }
  return last;
}
