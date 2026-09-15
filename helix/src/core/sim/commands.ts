// Runs one command line against the simulator. Returns the command's result value.
import { CommandError, evalFloat, evalInt } from "./compute";
import { execute } from "./execute";
import { data } from "./data";
import { scoreboard } from "./scoreboard";
import { getPath, parseSnbt, type Compound } from "./nbt";
import { select } from "./selector";
import type { Sim } from "./sim";
import { splitArgs } from "./tokens";
import type { SimEntity, SimSource, V3 } from "./types";

/** Thrown by `return` to end the running function with a value. */
export class Return {
  constructor(readonly value: number) {}
}

export const fail = (why: string): never => {
  throw new CommandError(why);
};

/** Reads `~ ~1 5` relative to the source position, or `^ ^ ^2` along the source's rotation. */
export function parsePos(t: string[], at: V3, src?: Pick<SimSource, "rot" | "eyes">): V3 {
  if (t[0].startsWith("^")) {
    const [left, up, forward] = t.map((c) => +(c.slice(1) || 0));
    const [yaw, pitch] = (src?.rot ?? [0, 0]).map((d) => (d * Math.PI) / 180);
    const f = [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const u = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
    const l = [Math.cos(yaw), 0, Math.sin(yaw)];
    // Players' eyes; other entities' eye heights aren't modelled.
    const base = src?.eyes ? [at[0], at[1] + 1.62, at[2]] : at;
    return [0, 1, 2].map((i) => base[i] + l[i] * left + u[i] * up + f[i] * forward) as V3;
  }
  return [0, 1, 2].map((i) => (t[i].startsWith("~") ? at[i] + +(t[i].slice(1) || 0) : +t[i])) as V3;
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
    case "teleport":
    case "tp": {
      // Rotation (`facing …`, yaw pitch) isn't tracked.
      if (t.length === 3) throw new Error(`unsupported teleport to an entity: ${line}`);
      const own = t.length === 4;
      const targets = own ? (src.self ? [src.self] : []) : select(sim.entities, t[1], src);
      const pos = parsePos(own ? t.slice(1, 4) : t.slice(2, 5), src.at);
      for (const e of targets) e.nbt.Pos = [...pos];
      return targets.length;
    }
    case "setblock":
      if (t[5] && t[5] !== "replace") throw new Error(`unsupported: ${line}`);
      sim.setBlock(parsePos(t.slice(1, 4), src.at), t[4]);
      return 1;
    case "fill": {
      if (t[8] && t[8] !== "replace") throw new Error(`unsupported: ${line}`);
      const [a, b] = [parsePos(t.slice(1, 4), src.at), parsePos(t.slice(4, 7), src.at)].map((p) => p.map(Math.floor));
      const [lo, hi] = [a.map((v, i) => Math.min(v, b[i])), a.map((v, i) => Math.max(v, b[i]))];
      const count = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
      if (count > 32768) fail(`too many blocks: ${count}`);
      for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) sim.setBlock([x, y, z], t[7]);
      return count;
    }
    // Output only: nothing a pack can read back.
    case "say":
    case "tellraw":
    case "particle":
    case "playsound":
    case "bossbar":
    case "advancement":
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
