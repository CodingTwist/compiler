// The `scoreboard players` command. Objectives aren't tracked, so any name works.
import { fail, holders } from "./commands";
import type { Sim } from "./sim";
import type { SimSource } from "./types";

/** Runs `scoreboard …` (tokens `t`) and returns its result. */
export function scoreboard(sim: Sim, t: string[], src: SimSource): number {
  if (t[1] === "objectives") return 0; // objectives aren't tracked: any name works
  const [verb, holder, objective] = [t[2], t[3], t[4]];
  // The game refuses to load a function with this, so it's a pack bug, not a failed command.
  if ((verb === "add" || verb === "remove") && +t[5] < 0) throw new Error(`negative amount won't parse: ${t.join(" ")}`);
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
