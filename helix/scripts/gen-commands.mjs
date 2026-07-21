/**
 * Generate one fluent command file per Minecraft command from a version's
 * Brigadier command tree.
 *
 * For each command `C` it writes src/core/commands/<c>.ts containing:
 *   - <C>Node      a typed AST node (`type = "<c>"`, carries CommandPart[])
 *   - <C>Builder   a fluent builder: one method per literal sub-command branch,
 *                  each mutating the node by reference (no terminal call)
 *   - <C>Handler   a per-command handler that validates/renders the node's parts
 *                  against whatever version the datapack targets
 *   - prototype augmentation installing `ctx.<c>()` on FunctionContext
 *
 * and rewrites src/core/commands/index.ts to import every command (running its
 * augmentation) and collect the handlers.
 *
 *   node scripts/gen-commands.mjs            # use newest fetched data
 *   node scripts/gen-commands.mjs 26_2.json  # use a specific data file
 *
 * Per-version correctness comes from the command tree at codegen time, not from
 * this script -- the generated builders are just authoring convenience. Commands
 * with bespoke frontends elsewhere (say, give, execute, ...) are skipped, and
 * commands hand-refined inside src/core/commands are preserved (not overwritten).
 */
import fs from "fs";
import path from "path";
import { CONCEPT_REGISTRIES, idsConstName } from "./concept-registries.mjs";

const DATA_DIR = path.join("src", "versions", "data");
const OUT_DIR = path.join("src", "core", "commands");
const VALUES_DIR = path.join("src", "core", "values");

// Commands with a bespoke, hand-written frontend OUTSIDE src/core/commands
// (their own ctx.<method> on the context chain). Don't generate or barrel these.
const HAND_WRITTEN_ELSEWHERE = new Set([
  "say",
  "tellraw",
  "give",
  "trigger",
  "random",
  "function",
  "execute",
  "scoreboard",
]);

// Commands whose src/core/commands/<c>.ts is hand-refined: keep the file as-is
// (don't overwrite) but still import/register it in the barrel.
const HAND_REFINED = new Set(["setblock", "data", "stopsound"]);

// Hand-written sugar/semantic handlers that live in src/core/commands but are
// NOT generated from the command tree (their nodes are emitted by the frontend,
// not 1:1 vanilla commands). The barrel imports + registers them; it never
// generates or overwrites these files.
const EXTRA_HANDLERS = [
  { module: "saycommand", cls: "SayCommand" },
  { module: "objective_init", cls: "ScoreInitCommand" },
  { module: "score_set", cls: "ScoreSetCommand" },
  { module: "score_add", cls: "ScoreAddCommand" },
  { module: "score_remove", cls: "ScoreRemoveCommand" },
  { module: "score_reset", cls: "ScoreResetCommand" },
  { module: "score_set_score", cls: "ScoreSetScoreCommand" },
  { module: "score_op", cls: "ScoreOpCommand" },
  { module: "score_get", cls: "ScoreGetCommand" },
  { module: "score_enable", cls: "ScoreEnableCommand" },
  { module: "tellraw", cls: "TellrawCommand" },
  { module: "give", cls: "PlayerGiveCommand" },
  { module: "trigger", cls: "TriggerCommand" },
  { module: "random", cls: "RandomCommand" },
  { module: "function", cls: "FunctionCommand" },
  { module: "function", cls: "FunctionTagCallCommand" },
  { module: "selector", cls: "SelectorCommand" },
  { module: "data_op", cls: "DataOpCommand" },
  { module: "if", cls: "IfHandler" },
  { module: "execute_as", cls: "ExecuteAsHandler" },
  { module: "execute", cls: "ExecuteHandler" },
  { module: "execute", cls: "ReturnRunHandler" },
  { module: "execute_store", cls: "ExecuteStoreHandler" },
  { module: "entity_guard", cls: "EntityGuardHandler" },
  { module: "at_entity", cls: "AtEntityHandler" },
  { module: "items_guard", cls: "ItemsGuardHandler" },
  { module: "near_guard", cls: "NearGuardHandler" },
  { module: "native", cls: "NativeCallHandler" },
];

// FunctionContext members a generated `ctx.<method>()` must never shadow.
const RESERVED_ENTRY = new Set([
  "version", "emit", "call", "createChildFunction", "newChild",
  "if", "say", "tellraw", "give", "playerGive", "player", "trigger", "random",
  "objective", "scoreInit", "scoreSet", "scoreAdd", "scoreSetScore",
  "scoreEnable",
]);

// Brigadier parser id -> the concept type a builder argument MUST accept.
// `ident` is the type name to import (null = a built-in primitive, no import);
// `source` is which module exports it. `type` is the full annotation written.
// Concept slots are OBJECT-ONLY by design (see PHILOSOPHY.md, Principle 1): no
// `| string` / `| number` escape hatch - the author must pass the real concept
// so the compiler can render it version-aware. Only genuine brigadier
// primitives (bool/number/string) stay primitive.
const V = (ident) => ({ ident, source: "values", type: ident });
const F = (ident) => ({ ident, source: "frontend", type: ident });
const P = (type) => ({ ident: null, source: null, type });
// A registry-backed resource concept: a named, branded `ResourceId<registry>`
// (e.g. `Biome`, `Enchantment`). `registry` is recorded so the named type +
// factory get generated into values/resource.generated.ts.
const R = (ident, registry) => ({ ident, source: "values", type: ident, registry });

// PascalCase the leaf of a registry id: "minecraft:worldgen/biome" -> "Biome",
// "minecraft:mob_effect" -> "MobEffect".
const deriveResourceType = (registry) =>
  registry
    .replace(/^minecraft:/, "")
    .replace(/^.*\//, "")
    .split(/[_/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

// Resource-family parsers: the concept is "an entry of some registry". WHICH
// registry (and thus the TS type) comes from the arg's `properties.registry`.
// Without a registry they fall back to the generic `Id`.
const RESOURCE_PARSERS = new Set([
  "minecraft:resource",
  "minecraft:resource_key",
  "minecraft:resource_or_tag",
  "minecraft:resource_or_tag_key",
  "minecraft:resource_selector",
]);

// Every named resource type used, collected during rendering -> emitted as
// `export type X = ResourceId<"registry">` + factory in resource.generated.ts.
const RESOURCE_TYPES = new Map(); // ident -> registry id

// Pick the concept type for an argument, considering registry properties.
const argType = (parser, properties) => {
  if (RESOURCE_PARSERS.has(parser) && properties?.registry) {
    const ident = deriveResourceType(properties.registry);
    return { ident, source: "values", type: ident, registry: properties.registry };
  }
  const t = PARSERS[parser] ?? P("string");
  return t;
};

const PARSERS = {
  "brigadier:bool": P("boolean"),
  "brigadier:integer": P("number"),
  "brigadier:long": P("number"),
  "brigadier:float": P("number"),
  "brigadier:double": P("number"),
  "brigadier:string": P("string"),

  "minecraft:block_pos": V("Pos"),
  "minecraft:vec3": V("Pos"),
  "minecraft:vec2": V("Pos"),
  "minecraft:column_pos": V("Pos"),
  "minecraft:rotation": V("Pos"),

  "minecraft:block_state": V("Block"),
  "minecraft:block_predicate": V("Block"),

  "minecraft:item_stack": V("Item"),
  "minecraft:item_predicate": V("Item"),

  "minecraft:entity": F("Selector"),
  "minecraft:game_profile": F("Selector"),
  "minecraft:score_holder": F("Selector"),

  // Generic / registry-family fallbacks (used only when no properties.registry).
  "minecraft:resource_location": V("Id"),
  "minecraft:resource": V("Id"),
  "minecraft:resource_key": V("Id"),
  "minecraft:resource_or_tag": V("Id"),
  "minecraft:resource_or_tag_key": V("Id"),
  "minecraft:resource_selector": V("Id"),
  // Dedicated id parsers -> their own named, branded resource types.
  "minecraft:dimension": R("Dimension", "minecraft:dimension"),
  "minecraft:particle": R("Particle", "minecraft:particle_type"),
  "minecraft:loot_table": R("LootTable", "minecraft:loot_table"),
  "minecraft:loot_modifier": R("LootModifier", "minecraft:loot_modifier"),
  "minecraft:loot_predicate": R("LootPredicate", "minecraft:predicate"),
  "minecraft:function": R("FunctionId", "minecraft:function"),
  "minecraft:dialog": R("Dialog", "minecraft:dialog"),
  "minecraft:heightmap": R("Heightmap", "minecraft:heightmap"),

  "minecraft:int_range": V("NumRange"),
  "minecraft:float_range": V("NumRange"),

  "minecraft:nbt_tag": V("Nbt"),
  "minecraft:nbt_compound_tag": V("Nbt"),
  "minecraft:nbt_path": V("NbtPath"),

  "minecraft:time": V("Time"),
  "minecraft:component": V("Component"),
  "minecraft:style": V("Component"),

  "minecraft:gamemode": V("Gamemode"),
  "minecraft:entity_anchor": V("EntityAnchor"),
  "minecraft:operation": V("ScoreboardOperation"),
  "minecraft:template_rotation": V("TemplateRotation"),
  "minecraft:template_mirror": V("TemplateMirror"),
  "minecraft:message": V("Message"),
  "minecraft:swizzle": V("Swizzle"),
  "minecraft:item_slot": V("ItemSlot"),
  "minecraft:item_slots": V("ItemSlot"),
  "minecraft:scoreboard_slot": V("ScoreboardSlot"),
  "minecraft:objective": V("Objective"),
  "minecraft:objective_criteria": V("ObjectiveCriteria"),
  "minecraft:team": V("Team"),
  "minecraft:team_color": V("TeamColor"),
  "minecraft:hex_color": V("HexColor"),
  "minecraft:uuid": V("Uuid"),
};

const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield", "let", "static",
]);

function pickDataFile(arg) {
  if (arg) return path.join(DATA_DIR, arg);
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
      return { f, dataVersion: d.dataVersion ?? 0 };
    })
    .sort((a, b) => b.dataVersion - a.dataVersion);
  if (files.length === 0) {
    throw new Error(`No data in ${DATA_DIR}; run "node scripts/versions.mjs sync" first.`);
  }
  return path.join(DATA_DIR, files[0].f);
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);

/** lower-camelCase from a list of raw parts (used for method names). */
function camel(parts) {
  const words = parts
    .join("_")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .split("_")
    .filter(Boolean);
  let name = words.map((w, i) => (i === 0 ? w : cap(w))).join("");
  if (/^[0-9]/.test(name)) name = "_" + name;
  if (RESERVED.has(name)) name = name + "_";
  return name;
}

/** PascalCase type prefix from a command name. */
const pascal = (cmd) =>
  cmd
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .split("_")
    .filter(Boolean)
    .map(cap)
    .join("");

function paramIdent(name, used) {
  let id = name.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(id)) id = "_" + id;
  if (RESERVED.has(id)) id = id + "_";
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) candidate = `${id}${n++}`;
  used.add(candidate);
  return candidate;
}

/** Collect every executable root->node template (ordered literal/arg segments). */
function collectEndpoints(node, initial) {
  const endpoints = [];
  const walk = (n, segs) => {
    if (n.executable) endpoints.push(segs);
    for (const [key, child] of Object.entries(n.children ?? {})) {
      const seg =
        child.type === "literal"
          ? { kind: "lit", value: key }
          : { kind: "arg", name: key, parser: child.parser, properties: child.properties };
      walk(child, segs.concat(seg));
    }
  };
  walk(node, initial);
  return endpoints;
}

/**
 * Group endpoints by their literal sequence; within a group trailing args
 * become optional. Returns { litSuffix: string[], args: {name,optional}[] }.
 * `litSuffix` excludes the leading command literal.
 */
function groupMethods(endpoints, cmd) {
  const groups = new Map();
  for (const segs of endpoints) {
    const lits = segs.filter((s) => s.kind === "lit").map((s) => s.value);
    const key = lits.join(" ");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(segs);
  }

  const out = [];
  for (const [, members] of groups) {
    const canonical = members.reduce((a, b) => (b.length > a.length ? b : a));
    const requiredArgs = Math.min(
      ...members.map((m) => m.filter((s) => s.kind === "arg").length),
    );
    // Keep the canonical segment ORDER (literals and args can interleave, e.g.
    // `setblock <pos> <block> keep` puts the mode literal AFTER the args). Args
    // beyond the shortest member's count are optional (always trailing).
    let i = 0;
    const segments = canonical.map((s) =>
      s.kind === "lit"
        ? { kind: "lit", value: s.value }
        : { kind: "arg", name: s.name, parser: s.parser, properties: s.properties, optional: i++ >= requiredArgs },
    );
    const litSuffix = segments
      .filter((s) => s.kind === "lit")
      .map((s) => s.value)
      .slice(1); // drop the leading command literal
    out.push({ litSuffix, segments });
  }
  return out;
}

/**
 * Walk a group's ordered segments, assigning a param to each arg and a part
 * expression to each segment. Required parts (literals + required args) keep
 * their position; optional args are always trailing, so they're appended after.
 */
function planSegments(segments, forceOptional, imports) {
  const used = new Set();
  const params = [];
  const requiredParts = []; // part expressions, in order
  const optionalArgs = []; // param ids appended (guarded) after the required parts
  for (const seg of segments) {
    if (seg.kind === "lit") {
      requiredParts.push(`litPart(${JSON.stringify(seg.value)})`);
      continue;
    }
    const id = paramIdent(seg.name, used);
    const optional = forceOptional || seg.optional;
    const t = argType(seg.parser, seg.properties);
    if (t.ident && t.source) imports[t.source].add(t.ident);
    if (t.registry) RESOURCE_TYPES.set(t.ident, t.registry);
    params.push(`${id}${optional ? "?" : ""}: ${t.type}`);
    if (optional) optionalArgs.push(id);
    else requiredParts.push(`argPart(${id})`);
  }
  return { params: params.join(", "), requiredParts, optionalArgs };
}

function renderMethod(cmd, group, forceOptional) {
  const name = camel(group.litSuffix);
  if (name === "") return null;
  // Collect this method's imports locally; the caller merges them only if the
  // method survives dedup, so a dropped duplicate leaves no orphaned import.
  const imports = { values: new Set(), frontend: new Set() };
  const { params, requiredParts, optionalArgs } = planSegments(
    group.segments,
    forceOptional,
    imports,
  );

  const lines = [`  ${name}(${params}): this {`, `    this.$set(${requiredParts.join(", ")});`];
  for (const id of optionalArgs) {
    lines.push(`    if (${id} !== undefined) this.$append(argPart(${id}));`);
  }
  lines.push(`    return this;`, `  }`);
  return { name, code: lines.join("\n"), imports };
}

function renderEntry(cmd, methodName, Cmd, emptyGroup, hasOtherGroups, imports) {
  // If the command is also continued via a builder method, don't force the
  // bare args to be supplied at the entry call. The empty group has no interior
  // literals, so all its args are trailing and safe to make optional.
  const segments = emptyGroup ? emptyGroup.segments : [{ kind: "lit", value: cmd }];
  const { params, requiredParts, optionalArgs } = planSegments(
    segments,
    hasOtherGroups,
    imports,
  );

  const lines = [
    `FunctionContext.prototype.${methodName} = function (this: FunctionContext${params ? ", " + params : ""}) {`,
    `  const node = new ${Cmd}Node();`,
    `  this.emit(node);`,
    `  const parts: CommandPart[] = [${requiredParts.join(", ")}];`,
  ];
  for (const id of optionalArgs) {
    lines.push(`  if (${id} !== undefined) parts.push(argPart(${id}));`);
  }
  lines.push(
    `  node.parts = parts;`,
    `  return new ${Cmd}Builder(node);`,
    `};`,
  );

  return { body: lines.join("\n"), ifaceParams: params };
}

function renderFile(cmd, groups) {
  const Cmd = pascal(cmd);
  const methodName = camel([cmd]); // JS-safe entry name; the raw `cmd` is the literal
  const emptyGroup = groups.find((g) => g.litSuffix.length === 0);
  const otherGroups = groups.filter((g) => g.litSuffix.length > 0);

  const imports = { values: new Set(), frontend: new Set() };

  const seen = new Set();
  const methodResults = otherGroups
    .map((g) => renderMethod(cmd, g, false))
    .filter((m) => m && !seen.has(m.name) && seen.add(m.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Register imports only for the methods that survive the dedup above -
  // renderMethod builds its own import set, so a dropped duplicate (e.g. a second
  // `give` group whose id arg is replaced by a `*` literal) no longer leaves an
  // orphaned, unused import behind.
  for (const m of methodResults) {
    m.imports.values.forEach((v) => imports.values.add(v));
    m.imports.frontend.forEach((v) => imports.frontend.add(v));
  }
  const methods = methodResults.map((m) => m.code);

  const entry = renderEntry(cmd, methodName, Cmd, emptyGroup, otherGroups.length > 0, imports);

  // Only import what the generated body actually uses (the project errors on
  // unused imports). `argPart` is only needed when some call takes args.
  const hasArg = (g) => g.segments.some((s) => s.kind === "arg");
  const anyArgs = (emptyGroup && hasArg(emptyGroup)) || otherGroups.some(hasArg);
  const baseImports = anyArgs
    ? "CommandBuilder, litPart, argPart"
    : "CommandBuilder, litPart";

  const conceptLines = [];
  if (imports.values.size > 0) {
    conceptLines.push(
      `import { ${[...imports.values].sort().join(", ")} } from "../values";`,
    );
  }
  if (imports.frontend.has("Selector")) {
    conceptLines.push(`import { Selector } from "../frontend/nodes/selector";`);
  }
  const conceptImports = conceptLines.length ? "\n" + conceptLines.join("\n") : "";

  return `// GENERATED by scripts/gen-commands.mjs -- do not edit by hand.
import { CommandNodeBase, CommandPart } from "../ir/node";
import { TreeCommandHandler } from "../ir/tree-command";
import { FunctionContext } from "../frontend/context";
import { ${baseImports} } from "./base";${conceptImports}

/** \`${cmd}\` */
export class ${Cmd}Node extends CommandNodeBase {
  readonly type = "${cmd}";
}

export class ${Cmd}Builder extends CommandBuilder<${Cmd}Node> {
${methods.join("\n\n")}
}

export class ${Cmd}Handler extends TreeCommandHandler<${Cmd}Node> {
  readonly type: ${Cmd}Node["type"] = "${cmd}";
}

declare module "../frontend/context" {
  interface FunctionContext {
    /** \`${cmd}\` - \`ctx.${methodName}()...\` */
    ${methodName}(${entry.ifaceParams}): ${Cmd}Builder;
  }
}

${entry.body}
`;
}

function main() {
  const file = pickDataFile(process.argv[2]);
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  const root = data.commands;

  const commands = Object.keys(root.children ?? {})
    .filter((c) => !HAND_WRITTEN_ELSEWHERE.has(c))
    .filter((c) => !RESERVED_ENTRY.has(camel([c]))) // would shadow a context member
    .sort();

  const generated = [];
  for (const cmd of commands) {
    if (HAND_REFINED.has(cmd)) {
      generated.push(cmd); // keep existing file, just barrel it
      continue;
    }
    const endpoints = collectEndpoints(root.children[cmd], [
      { kind: "lit", value: cmd },
    ]);
    if (endpoints.length === 0) continue; // pure redirect/alias, nothing to call
    fs.writeFileSync(path.join(OUT_DIR, `${cmd}.ts`), renderFile(cmd, groupMethods(endpoints, cmd)));
    generated.push(cmd);
  }

  generated.sort();
  const barrel = `// Command barrel. Importing each command file runs its
// \`FunctionContext.prototype.<cmd> = ...\` augmentation, so \`ctx.<cmd>()\`
// exists once this module is loaded. (Mostly GENERATED by scripts/gen-commands.mjs;
// the handler list below is regenerated, so add hand-written commands to
// HAND_REFINED in the script rather than editing this file.)
import { CommandHandler } from "../ir/commandhandler";
${generated.map((c) => `import { ${pascal(c)}Handler } from "./${c}";`).join("\n")}
${EXTRA_HANDLERS.map((e) => `import { ${e.cls} } from "./${e.module}";`).join("\n")}

${generated.map((c) => `export * from "./${c}";`).join("\n")}
// Re-export the sugar/semantic command modules too. The value imports above are
// elided from the emitted .d.ts (they're only used to \`new\` the handlers), which
// would drop these files - and their \`declare module "../frontend/context"\`
// prototype augmentations (ctx.if, ctx.whenEntity, ctx.whenPlayerNear, score ops,
// …) - from the published types, so cross-package consumers wouldn't see them.
// export * keeps the files referenced so the augmentations reach consumers.
${EXTRA_HANDLERS.map((e) => `export * from "./${e.module}";`).join("\n")}

/**
 * One handler instance per command, for the codegen handler map. Built lazily
 * (a function, not a top-level array) because some sugar handlers import codegen,
 * which imports this barrel -- constructing them at load time would hit the cycle
 * before those classes are initialised.
 */
export function createCommandHandlers(): CommandHandler[] {
  return [
${generated.map((c) => `    new ${pascal(c)}Handler(),`).join("\n")}
    // Hand-written sugar/semantic handlers (see EXTRA_HANDLERS in gen-commands.mjs).
${EXTRA_HANDLERS.map((e) => `    new ${e.cls}(),`).join("\n")}
  ];
}
`;
  fs.writeFileSync(path.join(OUT_DIR, "index.ts"), barrel);

  // Named, branded resource types collected while rendering command args.
  // Those whose registry has enumerable vanilla contents (CONCEPT_REGISTRIES)
  // also gain typed member accessors (`Enchantment.SHARPNESS`), wired to the
  // generated `<X>_IDS` maps in versions/data/ids.ts.
  const resourceNames = [...RESOURCE_TYPES.keys()].sort();
  const concept = new Set(CONCEPT_REGISTRIES);
  const idsImports = resourceNames
    .filter((name) => concept.has(RESOURCE_TYPES.get(name)))
    .map((name) => idsConstName(RESOURCE_TYPES.get(name)));
  const resourceFile = `// GENERATED by scripts/gen-commands.mjs -- do not edit by hand.
// One named, branded resource type per registry referenced by a command arg.
// See values/resource.ts for the \`ResourceId<R>\` base and the rationale.
// Registries with enumerable contents also expose typed members (e.g.
// \`Enchantment.SHARPNESS\`); custom / tagged ids still use the call form.
import { ResourceId } from "./resource";
import { withMembers } from "./members";
${idsImports.length ? `import { ${idsImports.sort().join(", ")} } from "../../versions/data/ids";\n` : ""}
${resourceNames
  .map((name) => {
    const reg = JSON.stringify(RESOURCE_TYPES.get(name));
    const type = `export type ${name} = ResourceId<${reg}>;`;
    const make = `(id: string): ${name} => new ResourceId(id, ${reg})`;
    if (concept.has(RESOURCE_TYPES.get(name))) {
      const ids = idsConstName(RESOURCE_TYPES.get(name));
      return `${type}\nexport const ${name} = withMembers(\n  ${make},\n  ${ids},\n  (id) => new ResourceId(id, ${reg}),\n);`;
    }
    return `${type}\nexport const ${name} = ${make};`;
  })
  .join("\n\n")}
`;
  fs.writeFileSync(path.join(VALUES_DIR, "resource.generated.ts"), resourceFile);

  console.error(
    `wrote ${generated.length} command files to ${OUT_DIR} + ${resourceNames.length} resource types (from ${path.basename(file)})`,
  );
}

main();
