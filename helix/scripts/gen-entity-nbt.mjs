/**
 * Generate `src/core/values/entities.generated.ts` - one typed NBT concept per entity in
 * the game - from SpyglassMC/vanilla-mcdoc's `java/world/entity/**.mcdoc`.
 *
 * mcdoc is the same source the hand-written schemas were transcribed from; at ~700 fields
 * across 120-odd entities, transcribing stopped being cheaper than parsing. The dialect
 * used by these files is small: `dispatch minecraft:entity[ids] to struct X { ... }`,
 * `struct X { ...Parent, Key?: type }`, and `#[since=]`/`#[until=]` gates. Everything it
 * does not model (enums, unions, nested structs) degrades to a raw `NbtInput` field, which
 * is exactly what the author would have written by hand anyway.
 *
 *   node scripts/gen-entity-nbt.mjs
 *
 * The output is committed, so a normal build needs no network.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CACHE = path.join("scripts", ".cache", "vanilla-mcdoc");
const TARBALL = "https://codeload.github.com/SpyglassMC/vanilla-mcdoc/tar.gz/refs/heads/main";
const VERSIONS_URL = "https://raw.githubusercontent.com/misode/mcmeta/summary/versions/data.min.json";
const OUT = path.join("src", "core", "values", "entities.generated.ts");
const DV_OUT = path.join("src", "core", "values", "entity-versions.generated.ts");

// Structs whose generated names are the ones the hand-written schemas already used, so
// consumers keep `ENTITY`/`MobFields`/… across this change.
const ALIASES = { EntityBase: "Entity", LivingEntity: "Living", MobBase: "Mob" };
// Entity ids whose PascalCase name would collide with an existing helix value export.
const FACTORY_RENAMES = { "minecraft:item": "ItemEntity", "minecraft:player": "PlayerEntity" };
// Structs that get an id-less factory too: the three bases (any entity can be summoned
// with them) plus the shared compounds a `data merge` writes on their own (a display's
// transform tween is a partial Display, not a whole entity).
const BASE_FACTORIES = ["Entity", "Living", "Mob", "DisplayBase", "DecomposedTransformation"];
// Entities mcdoc dispatches nothing for - they carry only their base's fields, but they
// are still summonable, so they still get a factory.
const EXTRA_DISPATCH = {
  EntityBase: ["fishing_bobber", "lightning_bolt"],
  ProjectileBase: ["wind_charge"],
};

// --- fetch -------------------------------------------------------------------------

async function ensureMcdoc() {
  if (fs.existsSync(CACHE)) return CACHE;
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const res = await fetch(TARBALL);
  if (!res.ok) throw new Error(`GET ${TARBALL} -> ${res.status}`);
  const tgz = path.join(path.dirname(CACHE), "vanilla-mcdoc.tar.gz");
  fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  fs.mkdirSync(CACHE, { recursive: true });
  const r = spawnSync("tar", ["-xzf", tgz, "-C", CACHE, "--strip-components=1"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("tar failed");
  fs.rmSync(tgz);
  return CACHE;
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".mcdoc") ? [p] : [];
  });

// --- parse -------------------------------------------------------------------------

/** Read from `text[i]` to the matching close of the bracket at `i`, respecting strings. */
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

/** Split a struct body into `{ kind: "field" | "spread", … }` entries. */
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
    // One entry: read to the comma that closes it at depth 0.
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
        // Inline struct: its fields belong to the parent, under the spread's own gates.
        for (const f of parseBody(target.slice(open + 1, matchBracket(target, open))))
          entries.push({ ...f, ...mergeGates(gates, f) });
      } else entries.push({ kind: "spread", name: bare(target), ...gates });
    } else {
      const colon = text.indexOf(":");
      const key = text.slice(0, colon).replace("?", "").trim();
      entries.push({ kind: "field", key, type: text.slice(colon + 1).trim(), docs, ...gates });
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

/** Every `struct X {}` and `dispatch minecraft:entity[…] to …` in the tree. */
function parseFile(text) {
  const structs = [];
  const re = /(?:dispatch\s+minecraft:entity\[([^\]]*)\]\s+to\s+)?struct\s+([A-Za-z_]\w*)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf("{", m.index + m[0].length - 1);
    const close = matchBracket(text, open);
    structs.push({
      name: m[2],
      ids: idList(m[1]),
      entries: parseBody(text.slice(open + 1, close)),
    });
    re.lastIndex = close;
  }
  // The other dispatch form: ids onto a struct declared elsewhere (`… to MobBase`), which
  // is how the 40-odd entities with no NBT of their own - blaze, spider, every boat - are
  // spelled. No entry list, just more ids for a struct another file defines.
  const ref = /dispatch\s+minecraft:entity\[([^\]]*)\]\s+to\s+(?!struct\b)([A-Za-z_]\w*)/g;
  while ((m = ref.exec(text))) structs.push({ name: m[2], ids: idList(m[1]), entries: [] });
  return structs;
}

// --- mcdoc type -> encoder ----------------------------------------------------------

/**
 * Fields whose mcdoc type is an opaque struct but which helix already has a value class
 * for - the author states the concept, not its NBT shape.
 */
const OVERRIDES = {
  blockState: { enc: "(b: BlockValue) => b.toBlockState()", ts: "BlockValue" },
  // mcdoc spells this as a slot-keyed map, which the parser leaves opaque.
  equipment: { enc: "asEquipment", ts: "EquipmentInput" },
};

/** `{ enc, ts }`: the `field({ encode })` argument and the author-facing TS type. */
function encoderFor(type) {
  const t = type.replace(/#\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const uuid = /#\[uuid\]/.test(type);
  // A homogeneous list of scalars keeps its element type; anything richer is raw NBT.
  const list = /^\[\s*(?:#\[[^\]]*\]\s*)?(\w+)/.exec(t);
  if (list && /^(string|int|short|long|byte)$/.test(list[1]))
    return { enc: "asList", ts: `readonly ${list[1] === "string" ? "string" : "number"}[]` };
  if (/^boolean$/.test(t)) return { enc: "asByte", ts: "boolean" };
  if (/^byte\b/.test(t)) return { enc: "Byte", ts: "number" };
  if (/^short\b/.test(t)) return { enc: "Short", ts: "number" };
  if (/^long\b/.test(t)) return { enc: "Long", ts: "number" };
  if (/^float\b/.test(t)) return { enc: "Float", ts: "number" };
  if (/^double\b/.test(t)) return { enc: "Double", ts: "number" };
  if (/^int\b(?!\[)/.test(t)) return { enc: undefined, ts: "number" };
  if (/^string\b/.test(t)) return { enc: undefined, ts: "string" };
  if (/^int\[\]/.test(t)) return { enc: "IntArray", ts: "readonly number[]", uuid };
  if (/^\[double\]/.test(t)) return { enc: "asDoubles", ts: "readonly number[]" };
  if (/^\[float\]/.test(t)) return { enc: "asFloats", ts: "readonly number[]" };
  if (/^\[/.test(t)) return { enc: "asList", ts: "readonly NbtInput[]" };
  if (/text_component|\bText\b/.test(t) && /string/.test(t)) return { enc: "asText", ts: "string" };
  return { enc: undefined, ts: "NbtInput" };
}

const camel = (key) =>
  key
    .replace(/^[A-Z]+(?![a-z])/, (s) => s.toLowerCase())
    .replace(/^[A-Z]/, (s) => s.toLowerCase())
    .replace(/_(\w)/g, (_, c) => c.toUpperCase());

const pascal = (id) =>
  id.replace(/^minecraft:/, "").replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());

const structConst = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

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

/** A key renamed at a version: both spellings live, so pick by version at render time. */
function renameSource(older, newer) {
  const wrap = (f, v) => (f.enc ? `${f.enc}(${v})` : v);
  const at = JSON.stringify(newer.since);
  // The return type is stated so each branch is checked against it on its own - a bare
  // ternary infers a union whose absent keys are `undefined`, which no NBT record accepts.
  return (
    `(v, version): Record<string, NbtInput> =>\n    atLeast(version, ${at})\n` +
    `      ? { ${newer.key}: ${wrap(newer, "v")} }\n` +
    `      : { ${older.key}: ${wrap(older, "v")} }`
  );
}

function main(structs, dataVersions) {
  const byName = new Map();
  for (const s of structs) {
    const prior = byName.get(s.name);
    if (prior) prior.ids.push(...s.ids);
    else byName.set(s.name, { ...s, ids: [...s.ids] });
  }
  for (const [name, ids] of Object.entries(EXTRA_DISPATCH)) byName.get(name)?.ids.push(...ids);

  const gateVersions = new Set();
  const resolved = new Map();

  /** A struct's own fields, with renamed pairs merged; parents stay a TS `extends`. */
  const own = (s) => {
    const fields = [];
    for (const e of s.entries) {
      // `[EquipmentSlot]: ItemStack` is a *map*, not a field - the whole struct is one
      // opaque compound, which is how anything referencing it is already typed.
      if (e.kind !== "field" || e.key.startsWith("[")) continue;
      const name = camel(e.key);
      const { enc, ts, uuid } = OVERRIDES[name] ?? encoderFor(e.type);
      if (e.since) gateVersions.add(e.since);
      if (e.until) gateVersions.add(e.until);
      fields.push({ ...e, name, enc, ts, uuid });
    }
    // `FallDistance` (until 1.21.5) + `fall_distance` (since 1.21.5) are one concept, as
    // long as the author still states it the same way - a float becoming a double is a
    // rename, a compound becoming an int array is a different field wearing the same name.
    const scalar = (ts) => ["number", "boolean", "string"].includes(ts);
    const out = [];
    for (const f of fields) {
      const prior = out.find((o) => o.name === f.name);
      if (!prior) {
        out.push(f);
        continue;
      }
      if (prior.until && f.since && (prior.ts === f.ts || (scalar(prior.ts) && scalar(f.ts)))) {
        prior.rename = f;
        prior.ts = f.ts;
      } else {
        // Keep the modern shape; the legacy one is unreachable through this field.
        Object.assign(prior, f, { legacy: prior.key });
      }
    }
    return out;
  };

  const parents = (s) =>
    s.entries.filter((e) => e.kind === "spread" && byName.has(e.name)).map((e) => e.name);

  const tsName = (n) => ALIASES[n] ?? n;
  for (const s of byName.values()) resolved.set(s.name, own(s));

  // A field whose type is a curated struct of its own (a villager's `VillagerData`) stays
  // typed one level down instead of degrading to a raw blob.
  const nestTarget = (f) => {
    const t = f.type.replace(/#\[[^\]]*\]/g, " ").trim();
    const target = byName.get(bare(t));
    return target && /^[\w:]+$/.test(t) && resolved.get(target.name)?.length ? target.name : null;
  };
  for (const s of byName.values())
    for (const f of resolved.get(s.name)) {
      const target = f.rename ? null : nestTarget(f);
      if (target) f.nest = target;
    }

  // Topological order: a struct's schema spreads its parents' and nests its targets'. A
  // nesting that would close a cycle falls back to raw NBT - `const` has no forward refs.
  const order = [];
  const seen = new Set();
  const visit = (name, stack = new Set()) => {
    if (seen.has(name)) return;
    const s = byName.get(name);
    if (!s) return;
    stack.add(name);
    for (const p of parents(s)) visit(p, stack);
    for (const f of resolved.get(name)) {
      if (!f.nest) continue;
      if (stack.has(f.nest)) delete f.nest;
      else visit(f.nest, stack);
    }
    stack.delete(name);
    seen.add(name);
    order.push(s);
    for (const f of resolved.get(name)) {
      if (!f.nest) continue;
      f.ts = `${tsName(f.nest)}Fields`;
      f.enc = `nested(${structConst(tsName(f.nest))})`;
    }
  };
  for (const s of byName.keys()) visit(s);
  const chunks = [];
  const factories = [];
  const names = new Map();

  for (const s of order) {
    const name = tsName(s.name);
    const fields = resolved.get(s.name);
    // A child that restates an inherited field with a different type (the player's
    // `CustomName`) has to hide the parent's, or the interfaces don't line up.
    const inherited = (name, acc = new Map()) => {
      const p = byName.get(name);
      if (!p) return acc;
      for (const q of parents(p)) inherited(q, acc);
      for (const f of resolved.get(name) ?? []) acc.set(f.name, f.ts);
      return acc;
    };
    const ext = parents(s).map((p) => {
      const clash = fields.filter((f) => {
        const ts = inherited(p).get(f.name);
        return ts !== undefined && ts !== f.ts;
      });
      const iface = `${tsName(p)}Fields`;
      return clash.length
        ? `Omit<${iface}, ${clash.map((f) => JSON.stringify(f.name)).join(" | ")}>`
        : iface;
    });
    const doc = s.ids.length ? `/** \`${s.ids.map((i) => `minecraft:${i}`).join("`, `")}\` */` : "";

    const iface = [
      doc,
      `export interface ${name}Fields${ext.length ? ` extends ${ext.join(", ")}` : ""} {`,
      ...fields.flatMap((f) => [
        ...(f.docs?.length ? [`  /** ${f.docs.join(" ")} */`] : []),
        `  ${f.name}?: ${f.ts};`,
      ]),
      "}",
    ]
      .filter(Boolean)
      .join("\n");

    const schema = [
      `export const ${structConst(name)}: EntityNbtSchema<${name}Fields> = {`,
      ...parents(s).map((p) => `  ...${structConst(tsName(p))},`),
      ...fields.map((f) => `  ${f.name}: ${f.rename ? renameSource(f, f.rename) : fieldSource(f)},`),
      "};",
    ].join("\n");

    chunks.push(`${iface}\n\n${schema}`);

    for (const id of s.ids) {
      const full = `minecraft:${id}`;
      const fname = FACTORY_RENAMES[full] ?? pascal(id);
      names.set(full, fname);
      factories.push(
        `/** \`${full}\` */\nexport const ${fname} = defineEntityNbt<${name}Fields>(` +
          `${structConst(name)}, ${JSON.stringify(full)});`,
      );
    }
  }

  for (const b of BASE_FACTORIES)
    factories.push(
      `/** Id-less: the fields of \`${b}\` as a standalone compound - state the entity type explicitly. */\n` +
        `export const ${b} = defineEntityNbt<${b}Fields>(${structConst(b)});`,
    );

  const header = `// GENERATED by scripts/gen-entity-nbt.mjs from SpyglassMC/vanilla-mcdoc.
// Do not edit by hand - re-run \`npm run gen:entity-nbt\`.
import {
  asByte,
  asDoubles,
  asEquipment,
  asFloats,
  asList,
  asText,
  atLeast,
  defineEntityNbt,
  field,
  nested,
  type EntityNbtSchema,
  type EquipmentInput,
} from "./entity-nbt";
import { Byte, Double, Float, IntArray, Long, Short, type NbtInput } from "./nbt";
import type { BlockValue } from "./block";
`;

  // What the raw-NBT warning names when it knows the entity id.
  const map =
    `/** The factory curating each entity, for the raw-NBT warning. */\n` +
    `export const ENTITY_FACTORY_NAMES: Readonly<Record<string, string>> = {\n` +
    [...names].map(([id, n]) => `  ${JSON.stringify(id)}: ${JSON.stringify(n)},`).join("\n") +
    `\n};`;

  fs.writeFileSync(
    OUT,
    `${header}\n${chunks.join("\n\n")}\n\n${factories.join("\n\n")}\n\n${map}\n`,
  );

  // The gate table: every version the schemas mention, resolved to its dataVersion.
  const dv = [...gateVersions].sort();
  // mcdoc gates on versions mcmeta hasn't released yet; until one ships there is no
  // dataVersion to compare against, so gate it past every profile rather than guess.
  const UNRELEASED = 99999999;
  const unreleased = dv.filter((v) => !dataVersions[v]);
  if (unreleased.length) console.log(`  unreleased, gated off: ${unreleased.join(", ")}`);
  fs.writeFileSync(
    DV_OUT,
    `// GENERATED by scripts/gen-entity-nbt.mjs from misode/mcmeta.\n` +
      `/** The dataVersion each version gated by an entity schema starts at. */\n` +
      `export const DV = {\n` +
      dv.map((v) => `  ${JSON.stringify(v)}: ${dataVersions[v] ?? UNRELEASED},`).join("\n") +
      `\n} as const;\n`,
  );

  const ids = order.flatMap((s) => s.ids).length;
  console.log(`  wrote ${OUT} (${order.length} schemas, ${ids} entities)`);
  console.log(`  wrote ${DV_OUT} (${dv.length} gate versions)`);
}

const root = await ensureMcdoc();
const files = walk(path.join(root, "java", "world", "entity"));
const structs = files.flatMap((f) => parseFile(fs.readFileSync(f, "utf-8")));
const versions = await (await fetch(VERSIONS_URL)).json();
main(structs, Object.fromEntries(versions.map((v) => [v.id, v.data_version])));
