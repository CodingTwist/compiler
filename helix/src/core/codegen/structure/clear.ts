// Derives a structure's `_clear` variant: solid cells swapped for a fill block, air cells dropped.
import zlib from "zlib";
import { Reader } from "./reader";
import { comp, COMPOUND, END, INT, list, LIST, STRING, type Tag } from "./tags";
import { Writer } from "./writer";

const AIR_NAMES = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
]);

/** The author-chosen fill for a `_clear` variant (see `Clip.clearWith`). */
export type ClearFill = { Name: string; Properties?: Record<string, string> };

/**
 * Builds the gzipped `_clear` variant of a structure: solid cells become `fill`, air cells
 * are
 * dropped so placement leaves them alone. Per-block NBT is discarded.
 */
export function deriveClearStructure(gz: Buffer, fill: ClearFill): Buffer {
  const { name, tag } = new Reader(zlib.gunzipSync(gz)).root();
  const root = comp(tag);

  // Which palette indices name an air block?
  const palette = list(root.get("palette")!);
  const airIndex = new Set<number>();
  palette.forEach((entry, idx) => {
    const nm = comp(entry).get("Name");
    if (nm && nm.id === STRING && AIR_NAMES.has(nm.v)) airIndex.add(idx);
  });

  // New single-entry palette: just the chosen fill block (+ its properties).
  const fillEntry = new Map<string, Tag>([
    ["Name", { id: STRING, v: fill.Name }],
  ]);
  if (fill.Properties && Object.keys(fill.Properties).length > 0) {
    fillEntry.set("Properties", {
      id: COMPOUND,
      v: new Map(
        Object.entries(fill.Properties).map(([k, val]) => [
          k,
          { id: STRING, v: val } as Tag,
        ]),
      ),
    });
  }
  const fillPalette: Tag = {
    id: LIST,
    v: { elem: COMPOUND, items: [{ id: COMPOUND, v: fillEntry }] },
  };

  // Keep every non-air cell, repointed to the barrier palette (state 0), pos only.
  const srcBlocks = list(root.get("blocks")!);
  const keptBlocks: Tag[] = [];
  for (const b of srcBlocks) {
    const m = comp(b);
    const state = m.get("state");
    const stateIdx = state && state.id === INT ? state.v : 0;
    if (airIndex.has(stateIdx)) continue; // listed air → leave the cell alone
    keptBlocks.push({
      id: COMPOUND,
      v: new Map<string, Tag>([
        ["state", { id: INT, v: 0 }],
        ["pos", m.get("pos")!],
      ]),
    });
  }

  const out = new Map<string, Tag>();
  out.set("size", root.get("size")!);
  out.set("entities", { id: LIST, v: { elem: END, items: [] } });
  out.set("palette", fillPalette);
  out.set("blocks", { id: LIST, v: { elem: COMPOUND, items: keptBlocks } });
  const dv = root.get("DataVersion");
  if (dv) out.set("DataVersion", dv);

  return zlib.gzipSync(new Writer().root(name, { id: COMPOUND, v: out }));
}
