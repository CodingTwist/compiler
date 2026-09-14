// Filters Spyglass diagnostics down to real problems, and places them in the file.
import { Datapack } from "../core/ir/datapack";

/** Map a 0-based character offset in `text` to a 1-based line/column. */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      last = i + 1;
    }
  }
  return { line, column: offset - last + 1 };
}

// Only JSON is validated, so collect the functions and objectives the pack defines to avoid
// false errors.
export function declaredSymbols(files: Map<string, string>): Set<string> {
  const declared = new Set<string>();
  for (const [rel, content] of files) {
    const fn = /^data\/([^/]+)\/functions?\/(.+)\.mcfunction$/.exec(rel);
    if (!fn) continue;
    declared.add(`function ${fn[1]}:${fn[2]}`);
    for (const m of content.matchAll(/scoreboard objectives add (\S+)/g)) {
      declared.add(`objective ${m[1]}`);
    }
  }
  return declared;
}

/** Is this an undeclared-symbol diagnostic for something the pack defines? */
export function isDeclaredByPack(message: string, declared: Set<string>): boolean {
  const m = /Cannot find (function|objective) “(.+?)”/.exec(message);
  return !!m && declared.has(`${m[1]} ${m[2]}`);
}

/** Is `rel` one of the pack's `dp.registryFile(...)` resources? */
export function isRegistryFile(dp: Datapack, rel: string): boolean {
  const prefix = `data/${dp.name}/`;
  if (!rel.startsWith(prefix)) return false;
  const inner = rel.slice(prefix.length, -".json".length);
  return dp.registryFileDefs.has(inner);
}
