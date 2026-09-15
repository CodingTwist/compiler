// Target selectors, UUIDs and player names resolved against the simulator's entities.
import { parseRange, splitList } from "./tokens";
import type { SimEntity, SimSource, V3 } from "./types";

/** Canonical lowercase UUID text, so `7262-0-0-0-1` and its padded form compare equal. */
export function canonicalUuid(text: string): string | undefined {
  const parts = text.split("-");
  if (parts.length !== 5 || !parts.every((p) => /^[0-9a-f]{1,16}$/i.test(p))) return undefined;
  const widths = [8, 4, 4, 4, 12];
  return parts.map((p, i) => BigInt(`0x${p}`).toString(16).padStart(widths[i], "0")).join("-");
}

/** The UUID text for an NBT `[I; a, b, c, d]` array. */
export function uuidFromInts(ints: number[]): string {
  const hex = ints.map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

const distance = (e: SimEntity, at: V3) => {
  const p = e.nbt.Pos as number[];
  return Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
};

/** Entities a selector, UUID or name picks, in the order the game would list them. */
export function select(entities: readonly SimEntity[], sel: string, src: SimSource): SimEntity[] {
  if (sel === "@s") return src.self ? [src.self] : [];
  if (!sel.startsWith("@")) {
    const uuid = canonicalUuid(sel);
    return uuid ? entities.filter((e) => e.uuid === uuid) : [];
  }
  const base = sel[1];
  let found = entities.filter((e) => (base === "a" || base === "p" || base === "r" ? e.type === "minecraft:player" : true));
  let limit = base === "e" || base === "a" ? Infinity : 1;
  let sort = base === "p" || base === "n" ? "nearest" : "arbitrary";

  const args = sel.length > 2 ? splitList(sel.slice(3, -1)) : [];
  for (const arg of args) {
    const eq = arg.indexOf("=");
    const [key, raw] = [arg.slice(0, eq), arg.slice(eq + 1)];
    const not = raw.startsWith("!");
    const value = not ? raw.slice(1) : raw;
    const keep = (test: (e: SimEntity) => boolean) => (found = found.filter((e) => test(e) !== not));
    switch (key) {
      case "tag":
        keep((e) => (value === "" ? e.tags.size > 0 : e.tags.has(value)));
        break;
      case "type":
        keep((e) => e.type === (value.includes(":") ? value : `minecraft:${value}`));
        break;
      case "distance": {
        const inRange = parseRange(value);
        keep((e) => inRange(distance(e, src.at)));
        break;
      }
      case "scores":
        for (const pair of splitList(value.slice(1, -1))) {
          const [objective, range] = pair.split("=");
          const inRange = parseRange(range);
          keep((e) => {
            const v = src.sim.score(e.uuid, objective);
            return v !== undefined && inRange(v);
          });
        }
        break;
      case "limit":
        limit = +value;
        break;
      case "sort":
        sort = value;
        break;
      default:
        throw new Error(`unsupported selector argument ${key} in ${sel}`);
    }
  }
  if (sort === "nearest") found.sort((a, b) => distance(a, src.at) - distance(b, src.at));
  if (sort === "furthest") found.sort((a, b) => distance(b, src.at) - distance(a, src.at));
  return found.slice(0, limit);
}
