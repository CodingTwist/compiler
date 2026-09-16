import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { deriveClearStructure } from "./clear";
import { Reader } from "./reader";
import { Writer } from "./writer";
import { COMPOUND, comp, INT, LIST, list, STRING, type Tag } from "./tags";

const str = (v: string): Tag => ({ id: STRING, v });
const int = (v: number): Tag => ({ id: INT, v });
const cmp = (o: Record<string, Tag>): Tag => ({ id: COMPOUND, v: new Map(Object.entries(o)) });
const ints = (a: number[]): Tag => ({ id: LIST, v: { elem: INT, items: a.map(int) } });
const cmps = (a: Tag[]): Tag => ({ id: LIST, v: { elem: COMPOUND, items: a } });

/** One air cell + one stone cell, with the palette key spelling under test. */
function source(nameKey: "Name" | "id"): Buffer {
  const root = cmp({
    DataVersion: int(5021),
    size: ints([2, 1, 1]),
    palette: cmps([cmp({ [nameKey]: str("minecraft:air") }), cmp({ [nameKey]: str("minecraft:stone") })]),
    blocks: cmps([
      cmp({ pos: ints([0, 0, 0]), state: int(0) }),
      cmp({ pos: ints([1, 0, 0]), state: int(1) }),
    ]),
    entities: cmps([]),
  });
  return zlib.gzipSync(new Writer().root("", root));
}

describe("deriveClearStructure", () => {
  for (const key of ["Name", "id"] as const) {
    it(`drops air and keeps the ${key} palette spelling`, () => {
      const out = deriveClearStructure(source(key), { Name: "minecraft:barrier" });
      const root = comp(new Reader(zlib.gunzipSync(out)).root().tag);
      expect(list(root.get("blocks")!)).toHaveLength(1); // the air cell is gone
      const entry = comp(list(root.get("palette")!)[0]);
      expect(entry.get(key)).toEqual(str("minecraft:barrier"));
    });
  }
});
