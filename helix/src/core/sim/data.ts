// The `data` command: reading and writing storage and entity NBT.
import { CommandError } from "./compute";
import { one } from "./commands";
import { getPath, mergeInto, parseSnbt, setPath, type Compound, type Tag } from "./nbt";
import type { Sim } from "./sim";
import type { SimSource } from "./types";

const fail = (why: string): never => {
  throw new CommandError(why);
};

/** The compound a `storage <id>` / `entity <target>` pair names. */
function dataTarget(sim: Sim, kind: string, target: string, src: SimSource): Compound {
  if (kind === "storage") return sim.storage(target);
  if (kind === "entity") return one(sim, target, src).nbt;
  throw new Error(`unsupported data target ${kind}`);
}

export function data(sim: Sim, t: string[], src: SimSource): number {
  const verb = t[1];
  const root = dataTarget(sim, t[2], t[3], src);
  if (verb === "merge") return mergeInto(root, parseSnbt(t[4]) as Compound), 1;
  if (verb === "get") {
    const v = t[4] === undefined ? root : getPath(root, t[4]);
    if (v === undefined) fail(`no data at ${t[4]}`);
    if (typeof v !== "number") return Array.isArray(v) ? v.length : 1;
    return Math.floor(v * (t[5] === undefined ? 1 : +t[5]));
  }
  if (verb !== "modify") throw new Error(`unsupported: ${t.join(" ")}`);

  const [path, mode] = [t[4], t[5]];
  let value: Tag | undefined;
  if (t[6] === "value") value = parseSnbt(t.slice(7).join(" "));
  else if (t[6] === "from") value = getPath(dataTarget(sim, t[7], t[8], src), t[9] ?? "{}") ?? fail(`no data at ${t[9]}`);
  else throw new Error(`unsupported: ${t.join(" ")}`);

  if (mode === "set") setPath(root, path, structuredClone(value));
  else if (mode === "merge") {
    const dest = path === "{}" ? root : (getPath(root, path) as Compound | undefined);
    if (dest === undefined) setPath(root, path, structuredClone(value));
    else mergeInto(dest, value as Compound);
  } else throw new Error(`unsupported: ${t.join(" ")}`);
  return 1;
}
