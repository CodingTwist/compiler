/**
 * Generate `src/core/values/block-entities.generated.ts` - one typed NBT concept per block
 * entity in the game (chest, decorated pot, sign, jukebox, ...) - from
 * SpyglassMC/vanilla-mcdoc's `java/world/block/**.mcdoc`.
 *
 * Mirrors `gen-entity-nbt.mjs`'s parser (same tarball cache, same struct/gate/field
 * machinery), extended for the two extra shapes the block dialect needs that entities don't:
 *
 *   - two-level dispatch: `minecraft:block[block ids] -> minecraft:block_entity[type id]
 *     -> struct`, vs an entity's single `minecraft:entity[id] -> struct`. Factories are
 *     keyed by the **block_entity_type id** (so all 17 shulker-box colors share one
 *     `ShulkerBox` factory); `BLOCK_ID_TO_BLOCK_ENTITY_TYPE` maps the block ids onto it.
 *   - gated struct alternation (`dispatch ... to (#[until=X] A | #[since=Y] B)`), used for
 *     sign's pre-1.20 format and the skull-block-entity fallback for mob heads. helix's
 *     oldest supported version is 1.20.1, already past every `until` arm seen today, so the
 *     generator always keeps the `since`-gated (modern) arm and drops the rest - same
 *     "shrink over time" stance as dropping a raw-string escape hatch once a type exists.
 *
 * Everything not modeled (component patches, profile textures, ...) degrades to a raw
 * `NbtInput` field, same as the entity generator.
 *
 *   node scripts/gen-block-entity-nbt.mjs
 *
 * The output is committed, so a normal build needs no network.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CACHE = path.join("scripts", ".cache", "vanilla-mcdoc");
const TARBALL =
  "https://codeload.github.com/SpyglassMC/vanilla-mcdoc/tar.gz/refs/heads/main";
const VERSIONS_URL =
  "https://raw.githubusercontent.com/misode/mcmeta/summary/versions/data.min.json";
const OUT = path.join("src", "core", "values", "block-entities.generated.ts");
const DV_OUT = path.join(
  "src",
  "core",
  "values",
  "entity-versions.generated.ts",
);

// Fields that are position/type bookkeeping the game fills in from the block placement
// itself - setting them through `.data()` would misplace or mis-id the block entity, so
// they're excluded from every schema rather than exposed as author fields.
const EXCLUDE_FIELDS = new Set(["id", "x", "y", "z", "keepPacked"]);

// Fields whose mcdoc type is either a generic the parser doesn't model (`SlottedItem<...>`)
// or a cross-package struct - the author states the concept, not its NBT shape.
const OVERRIDES = {
  Items: { enc: "asItems", ts: "SlottedItems" },
  // Deferred (`.stackNbt()`, not `.toStackNbt(version)`) so the result is a `CommandValue`
  // embedded as-is, not a plain string `toSnbt` would quote.
  RecordItem: { enc: "(v: ItemValue) => v.stackNbt()", ts: "ItemValue" },
  front_text: { enc: "asSignText", ts: "SignTextInput" },
  back_text: { enc: "asSignText", ts: "SignTextInput" },
  sherds: { enc: "asPotDecorations", ts: "PotDecorationsInput" },
};

// --- fetch (identical to gen-entity-nbt.mjs) ----------------------------------------

async function ensureMcdoc() {
  if (fs.existsSync(CACHE)) return CACHE;
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const res = await fetch(TARBALL);
  if (!res.ok) throw new Error(`GET ${TARBALL} -> ${res.status}`);
  const tgz = path.join(path.dirname(CACHE), "vanilla-mcdoc.tar.gz");
  fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  fs.mkdirSync(CACHE, { recursive: true });
  const r = spawnSync(
    "tar",
    ["-xzf", tgz, "-C", CACHE, "--strip-components=1"],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("tar failed");
  fs.rmSync(tgz);
  return CACHE;
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".mcdoc") ? [p] : [];
  });

// --- parse (struct body machinery shared verbatim with gen-entity-nbt.mjs) ---------

function matchBracket(text, i) {
  const open = text[i];
  const close = { "{": "}", "[": "]", "(": ")" }[open];
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === '"') {
      while (++j < text.length && text[j] !== '"') if (text[j] === "\\") j++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  throw new Error("unbalanced bracket");
}

function parseBody(body) {
  const entries = [];
  let i = 0;
  let docs = [];
  let attrs = [];
  const flush = () => {
    docs = [];
    attrs = [];
  };
  while (i < body.length) {
    const c = body[i];
    if (/\s/.test(c) || c === ",") {
      i++;
      continue;
    }
    if (body.startsWith("///", i)) {
      const end = body.indexOf("\n", i);
      docs.push(body.slice(i + 3, end < 0 ? undefined : end).trim());
      i = end < 0 ? body.length : end + 1;
      continue;
    }
    if (body.startsWith("//", i)) {
      const end = body.indexOf("\n", i);
      i = end < 0 ? body.length : end + 1;
      continue;
    }
    if (body.startsWith("#[", i)) {
      const end = matchBracket(body, i + 1);
      attrs.push(body.slice(i + 2, end));
      i = end + 1;
      continue;
    }
    let j = i;
    let depth = 0;
    for (; j < body.length; j++) {
      const ch = body[j];
      if (ch === '"') {
        while (++j < body.length && body[j] !== '"') if (body[j] === "\\") j++;
        continue;
      }
      if ("{[(".includes(ch)) depth++;
      else if ("}])".includes(ch)) depth--;
      else if (ch === "," && depth === 0) break;
    }
    const text = body.slice(i, j).trim();
    i = j + 1;
    if (!text) continue;
    const gates = gatesOf(attrs);
    if (text.startsWith("...")) {
      const target = text.slice(3).trim();
      if (target.startsWith("struct")) {
        const open = target.indexOf("{");
        for (const f of parseBody(
          target.slice(open + 1, matchBracket(target, open)),
        ))
          entries.push({ ...f, ...mergeGates(gates, f) });
      } else entries.push({ kind: "spread", name: bare(target), ...gates });
    } else {
      const colon = text.indexOf(":");
      const key = text.slice(0, colon).replace("?", "").trim();
      entries.push({
        kind: "field",
        key,
        type: text.slice(colon + 1).trim(),
        docs,
        ...gates,
      });
    }
    flush();
  }
  return entries;
}

const bare = (ref) => ref.split("::").pop().trim();
const gatesOf = (attrs) => {
  const g = {};
  for (const a of attrs) {
    const m = /^(since|until)="([^"]+)"$/.exec(a.trim());
    if (m) g[m[1]] = m[2];
  }
  return g;
};
const mergeGates = (outer, inner) => ({
  since: inner.since ?? outer.since,
  until: inner.until ?? outer.until,
});

const idList = (s) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("%"));

/**
 * Read a parenthesized gated alternation (`( #[until=X] A | #[since=Y] B | )`) starting at
 * `text[open]` (the "("), and return `{ body, end }` for the modern arm - preferring a
 * `since`-gated arm (the newest shape), else the first ungated arm. Older arms exist for
 * versions below helix's oldest supported target and are intentionally dropped.
 */
function pickModernArm(text, open) {
  const close = matchBracket(text, open);
  const inner = text.slice(open + 1, close);
  const arms = [];
  let i = 0;
  while (i < inner.length) {
    if (/\s/.test(inner[i]) || inner[i] === "|") {
      i++;
      continue;
    }
    const attrs = [];
    while (inner.startsWith("#[", i)) {
      const end = matchBracket(inner, i + 1);
      attrs.push(inner.slice(i + 2, end));
      i = end + 1;
      while (/\s/.test(inner[i])) i++;
    }
    if (i >= inner.length) break;
    let j = i;
    let depth = 0;
    for (; j < inner.length; j++) {
      const ch = inner[j];
      if ("{[(".includes(ch)) depth++;
      else if ("}])".includes(ch)) depth--;
      else if (ch === "|" && depth === 0) break;
    }
    const body = inner.slice(i, j).trim();
    i = j + 1;
    if (body) arms.push({ gates: gatesOf(attrs), body });
  }
  const chosen =
    arms.find((a) => a.gates.since) ??
    arms.find((a) => !a.gates.since && !a.gates.until) ??
    arms[0];
  return { body: chosen?.body ?? "", end: close };
}

/** Every `struct X {}` in the tree, wherever it appears (including inside a dispatch). */
function parseStructs(text) {
  const structs = [];
  const re = /struct\s+([A-Za-z_]\w*)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf("{", m.index + m[0].length - 1);
    const close = matchBracket(text, open);
    structs.push({
      name: m[1],
      entries: parseBody(text.slice(open + 1, close)),
    });
    re.lastIndex = close;
  }
  return structs;
}

/**
 * `dispatch minecraft:block_entity[type ids] to <target>` - the primary struct-per-type
 * dispatch (mirrors the entity dialect's single-level form). Returns `{ ids, name }` pairs;
 * the struct body itself is read from `parseStructs`'s independent full-text scan, since an
 * inline `to struct X { ... }` is textually still `struct X { ... }` regardless of what
 * precedes it.
 */
function parseBlockEntityDispatch(text) {
  const out = [];
  const re = /dispatch\s+minecraft:block_entity\[([^\]]*)\]\s+to\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const ids = idList(m[1]);
    let i = re.lastIndex;
    while (/\s/.test(text[i])) i++;
    if (text.startsWith("struct", i)) {
      const open = text.indexOf("{", i);
      const name = text.slice(i + 6, open).trim();
      const close = matchBracket(text, open);
      out.push({ ids, name });
      re.lastIndex = close;
    } else if (text[i] === "(") {
      const { body, end } = pickModernArm(text, i);
      re.lastIndex = end;
      if (body.startsWith("struct")) {
        const open = body.indexOf("{");
        out.push({ ids, name: body.slice(6, open).trim() });
      } else if (body) {
        out.push({ ids, name: bare(body) });
      }
    } else {
      const end = text.slice(i).search(/[\s,)]/);
      const name = text.slice(i, end < 0 ? undefined : i + end).trim();
      out.push({ ids, name: bare(name) });
    }
  }
  return out;
}

/**
 * `dispatch minecraft:block[block ids] to minecraft:block_entity[type id]` - the block ->
 * block_entity_type indirection with no NBT-dialect equivalent on the entity side.
 */
function parseBlockToTypeDispatch(text) {
  const out = [];
  const re =
    /dispatch\s+minecraft:block\[([^\]]*)\]\s+to\s+minecraft:block_entity\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(text))) {
    const type = idList(m[2])[0];
    if (type) out.push({ blockIds: idList(m[1]), type });
  }
  return out;
}

/**
 * `dispatch minecraft:block[block ids] to <struct-or-alternation>`, skipping the
 * `minecraft:block[...] to minecraft:block_entity[...]` form (handled above). Covers plain
 * `BlockEntity` blocks (bell, ender_chest, ...) and the skull-block-entity fallback for mob
 * heads, which resolve straight to a struct name with no dedicated block_entity_type of
 * their own - piggybacked onto whichever factory already owns that struct.
 */
function parseBlockToStructDispatch(text) {
  const out = [];
  const re = /dispatch\s+minecraft:block\[([^\]]*)\]\s+to\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const blockIds = idList(m[1]);
    let i = re.lastIndex;
    while (/\s/.test(text[i])) i++;
    if (text.startsWith("minecraft:block_entity[", i)) continue; // handled elsewhere
    if (text[i] === "(") {
      const { body } = pickModernArm(text, i);
      if (body && !body.startsWith("struct")) out.push({ blockIds, name: bare(body) });
      continue;
    }
    if (text.startsWith("struct", i)) continue; // no such case in the block dialect today
    const end = text.slice(i).search(/[\s,)\n]/);
    const name = text.slice(i, end < 0 ? undefined : i + end).trim();
    if (name && !name.startsWith("%")) out.push({ blockIds, name: bare(name) });
  }
  return out;
}

// --- mcdoc type -> encoder (identical rules to gen-entity-nbt.mjs) -----------------

function encoderFor(type) {
  const t = type
    .replace(/#\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const uuid = /#\[uuid\]/.test(type);
  const list = /^\[\s*(?:#\[[^\]]*\]\s*)?(\w+)/.exec(t);
  if (list && /^(string|int|short|long|byte)$/.test(list[1]))
    return {
      enc: "asList",
      ts: `readonly ${list[1] === "string" ? "string" : "number"}[]`,
    };
  if (/^boolean$/.test(t)) return { enc: "asByte", ts: "boolean" };
  if (/^byte\b/.test(t)) return { enc: "Byte", ts: "number" };
  if (/^short\b/.test(t)) return { enc: "Short", ts: "number" };
  if (/^long\b/.test(t)) return { enc: "Long", ts: "number" };
  if (/^float\b/.test(t)) return { enc: "Float", ts: "number" };
  if (/^double\b/.test(t)) return { enc: "Double", ts: "number" };
  if (/^int\b(?!\[)/.test(t)) return { enc: undefined, ts: "number" };
  if (/^string\b/.test(t)) return { enc: undefined, ts: "string" };
  if (/^int\[\]/.test(t))
    return { enc: "IntArray", ts: "readonly number[]", uuid };
  if (/^\[double\]/.test(t)) return { enc: "asDoubles", ts: "readonly number[]" };
  if (/^\[float\]/.test(t)) return { enc: "asFloats", ts: "readonly number[]" };
  if (/^\[/.test(t)) return { enc: "asList", ts: "readonly NbtInput[]" };
  if (/text_component|\bText\b/.test(t) && /string/.test(t))
    return { enc: "asText", ts: "string" };
  return { enc: undefined, ts: "NbtInput" };
}

const camel = (key) =>
  key
    .replace(/^[A-Z]+(?![a-z])/, (s) => s.toLowerCase())
    .replace(/^[A-Z]/, (s) => s.toLowerCase())
    .replace(/_(\w)/g, (_, c) => c.toUpperCase());

const pascal = (id) =>
  id
    .replace(/^minecraft:/, "")
    .replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());

const structConst = (name) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

// --- emit ---------------------------------------------------------------------------

function fieldSource(f) {
  const { enc } = f;
  const key = JSON.stringify(f.key);
  const parts = [`key: ${key}`];
  if (enc) parts.push(`encode: ${enc}`);
  if (f.since) parts.push(`since: ${JSON.stringify(f.since)}`);
  if (f.until) parts.push(`until: ${JSON.stringify(f.until)}`);
  return `field({ ${parts.join(", ")} })`;
}

function renameSource(older, newer) {
  const wrap = (f, v) => (f.enc ? `${f.enc}(${v})` : v);
  const at = JSON.stringify(newer.since);
  return (
    `(v, version): Record<string, NbtInput> =>\n    atLeast(version, ${at})\n` +
    `      ? { ${newer.key}: ${wrap(newer, "v")} }\n` +
    `      : { ${older.key}: ${wrap(older, "v")} }`
  );
}

function main(structDefs, typeDispatches, blockToType, blockToStruct, dataVersions) {
  const byName = new Map();
  for (const s of structDefs) if (!byName.has(s.name)) byName.set(s.name, s);

  const gateVersions = new Set();
  const resolved = new Map();

  const own = (s) => {
    const fields = [];
    for (const e of s.entries) {
      if (e.kind !== "field" || e.key.startsWith("[")) continue;
      if (EXCLUDE_FIELDS.has(e.key)) continue;
      const name = camel(e.key);
      // An override describes the *current* shape of a concept; an `until`-gated entry
      // predates it (e.g. pre-26.3 `sherds` was a plain id list, not `PotDecorations`), so
      // it's read naturally instead of forced through the override meant for the new one.
      const override = e.until === undefined ? OVERRIDES[e.key] : undefined;
      const { enc, ts } = override ?? encoderFor(e.type);
      if (e.since) gateVersions.add(e.since);
      if (e.until) gateVersions.add(e.until);
      fields.push({ ...e, name, enc, ts });
    }
    const scalar = (ts) => ["number", "boolean", "string"].includes(ts);
    const out = [];
    for (const f of fields) {
      const prior = out.find((o) => o.name === f.name);
      if (!prior) {
        out.push(f);
        continue;
      }
      if (
        prior.until &&
        f.since &&
        (prior.ts === f.ts || (scalar(prior.ts) && scalar(f.ts)))
      ) {
        prior.rename = f;
        prior.ts = f.ts;
      } else {
        Object.assign(prior, f, { legacy: prior.key });
      }
    }
    return out;
  };

  const parents = (s) =>
    s.entries
      .filter((e) => e.kind === "spread" && byName.has(e.name))
      .map((e) => e.name);

  for (const s of byName.values()) resolved.set(s.name, own(s));

  const order = [];
  const seen = new Set();
  const visit = (name, stack = new Set()) => {
    if (seen.has(name)) return;
    const s = byName.get(name);
    if (!s) return;
    stack.add(name);
    for (const p of parents(s)) visit(p, stack);
    stack.delete(name);
    seen.add(name);
    order.push(s);
  };
  // Only emit structs reachable from an actual block_entity_type dispatch (directly, or as
  // a spread parent of one) - unlike the entity dialect, block mcdoc declares plenty of
  // structs purely as a field's element type (a beehive's `Bee`/`FlowerPos`) with no nesting
  // support here to consume them; leaving them unfiltered just orphans exports and risks a
  // name collision with an unrelated entity schema (`Bee` the hive occupant vs. `Bee` the
  // mob).
  const roots = new Set(typeDispatches.map((d) => d.name).filter((n) => byName.has(n)));
  for (const s of roots) visit(s);

  const chunks = [];
  for (const s of order) {
    const name = s.name;
    const fields = resolved.get(name);
    const inherited = (n, acc = new Map()) => {
      const p = byName.get(n);
      if (!p) return acc;
      for (const q of parents(p)) inherited(q, acc);
      for (const f of resolved.get(n) ?? []) acc.set(f.name, f.ts);
      return acc;
    };
    const ext = parents(s).map((p) => {
      const clash = fields.filter((f) => {
        const ts = inherited(p).get(f.name);
        return ts !== undefined && ts !== f.ts;
      });
      const iface = `${p}Fields`;
      return clash.length
        ? `Omit<${iface}, ${clash.map((f) => JSON.stringify(f.name)).join(" | ")}>`
        : iface;
    });

    const iface = [
      `export interface ${name}Fields${ext.length ? ` extends ${ext.join(", ")}` : ""} {`,
      ...fields.flatMap((f) => [
        ...(f.docs?.length ? [`  /** ${f.docs.join(" ")} */`] : []),
        `  ${f.name}?: ${f.ts};`,
      ]),
      "}",
    ].join("\n");

    const schema = [
      `export const ${structConst(name)}: BlockEntityNbtSchema<${name}Fields> = {`,
      ...parents(s).map((p) => `  ...${structConst(p)},`),
      ...fields.map(
        (f) => `  ${f.name}: ${f.rename ? renameSource(f, f.rename) : fieldSource(f)},`,
      ),
      "};",
    ].join("\n");

    chunks.push(`${iface}\n\n${schema}`);
  }

  // One factory per block_entity_type id, keyed off the type's own dispatch (not the block
  // id list, which can be many-to-one - 17 shulker-box colors share one factory).
  const factories = [];
  const factoryNameByType = new Map();
  const typeByStructName = new Map();
  const seenType = new Set();
  for (const { ids, name } of typeDispatches) {
    if (!byName.has(name)) continue;
    for (const type of ids) {
      const full = `minecraft:${type}`;
      if (seenType.has(full)) continue;
      seenType.add(full);
      const fname = pascal(type);
      factoryNameByType.set(full, fname);
      if (!typeByStructName.has(name)) typeByStructName.set(name, full);
      factories.push(
        `/** \`${full}\` */\nexport const ${fname} = defineBlockEntityNbt<${name}Fields>(` +
          `${structConst(name)}, ${JSON.stringify(full)});`,
      );
    }
  }

  // block id -> block_entity_type id: direct mappings, plus direct block->struct dispatches
  // piggybacked onto whichever factory already owns that struct.
  const blockIdToType = new Map();
  for (const { blockIds, type } of blockToType) {
    const full = `minecraft:${type}`;
    if (!factoryNameByType.has(full)) continue;
    for (const id of blockIds) blockIdToType.set(`minecraft:${id}`, full);
  }
  for (const { blockIds, name } of blockToStruct) {
    const type = typeByStructName.get(name);
    if (!type) continue;
    for (const id of blockIds) blockIdToType.set(`minecraft:${id}`, type);
  }

  const header = `// GENERATED by scripts/gen-block-entity-nbt.mjs from SpyglassMC/vanilla-mcdoc.
// Do not edit by hand - re-run \`npm run gen:block-entity-nbt\`.
import {
  asByte,
  asDoubles,
  asFloats,
  asList,
  asText,
  atLeast,
  defineBlockEntityNbt,
  field,
  type BlockEntityNbtSchema,
} from "./block-entity-nbt";
import { asItems, asPotDecorations, asSignText } from "./block-entity-nbt/fields";
import type {
  SlottedItems,
  SignTextInput,
  PotDecorationsInput,
} from "./block-entity-nbt/fields";
import { Byte, Double, Float, IntArray, Long, Short, type NbtInput } from "./nbt";
import type { ItemValue } from "./item";
`;

  const map =
    `/** The factory curating each block entity type, for the raw-NBT warning. */\n` +
    `export const BLOCK_ENTITY_FACTORY_NAMES: Readonly<Record<string, string>> = {\n` +
    [...factoryNameByType]
      .map(([id, n]) => `  ${JSON.stringify(id)}: ${JSON.stringify(n)},`)
      .join("\n") +
    `\n};\n\n` +
    `/** Every block id's block_entity_type, for the compile-time \`.data()\` map and the runtime warning. */\n` +
    `export const BLOCK_ID_TO_BLOCK_ENTITY_TYPE: Readonly<Record<string, string>> = {\n` +
    [...blockIdToType]
      .map(([id, type]) => `  ${JSON.stringify(id)}: ${JSON.stringify(type)},`)
      .join("\n") +
    `\n};\n\n` +
    `/**\n * Every block id's typed \`.data()\` payload, keyed off {@link BLOCK_ID_TO_BLOCK_ENTITY_TYPE}.\n` +
    ` * \`BlockValue.data()\` uses this to hard-reject a bare \`Nbt(...)\`/string once a block's\n` +
    ` * type has a typed factory - see \`block.ts\`.\n */\n` +
    `export interface BlockEntityDataByBlockId {\n` +
    [...blockIdToType]
      .map(
        ([id, type]) =>
          `  ${JSON.stringify(id)}: ReturnType<typeof ${factoryNameByType.get(type)}>;`,
      )
      .join("\n") +
    `\n}`;

  fs.writeFileSync(
    OUT,
    `${header}\n${chunks.join("\n\n")}\n\n${factories.join("\n\n")}\n\n${map}\n`,
  );

  // Merge into the shared gate table entity-nbt already generates, rather than a second file.
  const existing = fs.existsSync(DV_OUT)
    ? Object.fromEntries(
        [...fs.readFileSync(DV_OUT, "utf-8").matchAll(/"([^"]+)":\s*(\d+),/g)].map(
          ([, v, dv]) => [v, Number(dv)],
        ),
      )
    : {};
  const dv = [...new Set([...gateVersions, ...Object.keys(existing)])].sort();
  const UNRELEASED = 99999999;
  fs.writeFileSync(
    DV_OUT,
    `// GENERATED by scripts/gen-entity-nbt.mjs and scripts/gen-block-entity-nbt.mjs from misode/mcmeta.\n` +
      `/** The dataVersion each version gated by an entity or block-entity schema starts at. */\n` +
      `export const DV = {\n` +
      dv
        .map(
          (v) =>
            `  ${JSON.stringify(v)}: ${existing[v] ?? dataVersions[v] ?? UNRELEASED},`,
        )
        .join("\n") +
      `\n} as const;\n`,
  );

  console.log(
    `  wrote ${OUT} (${order.length} schemas, ${factoryNameByType.size} block entity types, ${blockIdToType.size} block ids)`,
  );
  console.log(`  updated ${DV_OUT} (${dv.length} gate versions)`);
}

const root = await ensureMcdoc();
const files = walk(path.join(root, "java", "world", "block"));
const texts = files.map((f) => fs.readFileSync(f, "utf-8"));

const structDefs = texts.flatMap(parseStructs);
const typeDispatches = texts.flatMap(parseBlockEntityDispatch);
const blockToType = texts.flatMap(parseBlockToTypeDispatch);
const blockToStruct = texts.flatMap(parseBlockToStructDispatch);

const versions = await (await fetch(VERSIONS_URL)).json();
main(
  structDefs,
  typeDispatches,
  blockToType,
  blockToStruct,
  Object.fromEntries(versions.map((v) => [v.id, v.data_version])),
);
