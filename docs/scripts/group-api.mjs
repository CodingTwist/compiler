// Regroups TypeDoc's generated API sidebar from flat by-kind buckets
// (Classes / Interfaces / Type Aliases / Variables / Functions - every symbol
// on the same level) into meaningful *domain* groups, so the API reads like the
// authoring surface it documents. Runs after `gen:api` and writes the composed
// `/api/` sidebar to `.vitepress/api-sidebar.json`, which the VitePress config
// picks up. This is the single home for the API taxonomy - add a symbol to a
// group here, not with per-symbol `@group` tags scattered through core source.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, "..", "api");
const outFile = join(here, "..", ".vitepress", "api-sidebar.json");

// helix domain taxonomy. Order = display order; a symbol may appear under one
// group by name (the same name across kinds - e.g. the `Block` value and the
// `Block` type - lands in the same group and is disambiguated by kind label).
const HELIX_GROUPS = {
  "Datapack & functions": [
    "Datapack", "FunctionContext", "FunctionRef", "Player",
    "RuntimeTarget", "FunctionId",
  ],
  "Selectors": [
    "Selector", "SelectorScore", "SelectorBase", "EntityTarget", "EntityAnchor",
  ],
  "Scores & math": [
    "Score", "ScoreVec3", "Fixed", "Objective", "ScoreTarget", "ScoreTargetValue",
    "ObjectiveKind", "ObjectiveCriteria", "usedStatCriteria",
    "ScoreboardOperation", "ScoreboardSlot", "ScoreBound",
    "lerp", "lerpVec3", "quat", "rotateAboutPivot", "rotateVec", "round6",
    "Vec3", "Quat", "Swizzle", "Axis", "add", "sub",
  ],
  "Text & chat": [
    "Text", "TellrawText", "TellrawPart", "ClickEvent", "HoverEvent",
    "click", "hover", "ClickAction", "TextComponent", "Message",
    "HexColor", "TeamColor",
  ],
  "Values": [
    "Pos", "PosValue", "Block", "BlockValue", "BlockStates", "BlockStateVariant",
    "Item", "ItemValue", "ItemSlot", "Slot",
    "Nbt", "NbtValue", "NbtNum", "NbtInput", "NbtPath", "NbtPathValue",
    "Id", "IdValue", "ResourceId",
    "Range", "NumRange", "NumRangeValue", "RangeEntry", "Bound",
    "Display", "DisplayValue", "DisplayChild",
    "Component", "ComponentValue",
    "Time", "TimeValue", "Timeline", "WorldClock",
    "FOREVER", "TICKS_PER_SECOND", "Countdown",
    "Byte", "Short", "Float", "Double", "Long",
    "toSnbt", "toCommandValue", "CommandValue", "normalizeId", "Path",
  ],
  "Data resources": [
    "Predicate", "PredicateRef", "PredicateJson",
    "LootTableDef", "LootTableRef", "LootTable", "LootPool", "LootFunction", "LootModifier",
    "ItemModifier", "ItemModifierRef",
    "RecipeDef", "RecipeRef", "Recipe", "Ingredient",
    "AdvancementDef", "Advancement", "Trigger", "CriterionJson",
    "Model", "ModelRef", "ModelResource", "ItemModel", "BlockState",
    "SpecialModel", "TintSource", "TINT_SOURCES", "SPECIAL_MODEL_TYPES",
    "RANGE_DISPATCH_PROPERTIES", "SELECT_PROPERTIES", "CONDITION_PROPERTIES",
    "SelectCase", "Transform", "NumberProvider",
    "holdingPredicate", "holdingPredicateName", "HoldingOptions",
    "EntityPredicateSpec", "EntityCondition", "EntityFlags",
    "EquipmentSpec", "LocationSpec",
  ],
  "Registry IDs": [
    "Attribute", "Biome", "Enchantment", "EntityType", "MobEffect", "Particle",
    "Structure", "Dimension", "DamageType", "PointOfInterestType",
    "ConfiguredFeature", "TemplatePool", "TestInstance", "Dialog", "BLOCK_TAGS",
    "Gamemode", "Team", "TemplateMirror", "TemplateRotation", "Uuid",
  ],
  "Versions": [
    "v1_20_1", "v1_20_4", "v1_21_4", "v26_2",
    "VersionProfile", "PackFormatSpec", "RegistrySet", "CommandTree",
  ],
  "Build, cost & validation": [
    "buildDatapack", "analyzeCost", "formatCostReport",
    "CostReport", "TickRootCost", "CallSiteCost", "FunctionCost",
    "validateDatapack", "formatMcdocDiagnostics", "McdocDiagnostic", "ValidateOptions",
  ],
  "Compiler internals": [
    "ASTNode", "ExpressionNode", "CommandNodeBase", "FunctionNode",
    "CommandPart", "ArgInput", "PRIVATE_ROOT", "privateName", "triggerCmd",
    "validateRegistryId",
  ],
};

const KIND_LABEL = {
  Classes: "class",
  Interfaces: "interface",
  "Type Aliases": "type",
  Variables: "value",
  Functions: "fn",
};

const normLink = (link) =>
  link.replace(/^\/\.\.\/docs/, "").replace(/\.md$/, "");

const readSidebar = (pkg) => {
  const p = join(apiDir, pkg, "typedoc-sidebar.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

// Flatten the by-kind sidebar into one list, carrying each symbol's kind.
const flatten = (sidebar) =>
  sidebar.flatMap((grp) =>
    (grp.items || []).map((it) => ({
      text: it.text,
      link: normLink(it.link),
      kind: grp.text,
    })),
  );

// Disambiguate names that appear under more than one kind (e.g. the `Block`
// value vs the `Block` type) by appending the kind label.
const labelled = (items) => {
  const counts = new Map();
  for (const it of items) counts.set(it.text, (counts.get(it.text) || 0) + 1);
  return items.map((it) =>
    counts.get(it.text) > 1 && KIND_LABEL[it.kind]
      ? { ...it, label: `${it.text} (${KIND_LABEL[it.kind]})` }
      : { ...it, label: it.text },
  );
};

const toItems = (arr) =>
  arr
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((it) => ({ text: it.label, link: it.link }));

// helix: regroup by the domain taxonomy above.
const groupHelix = (sidebar) => {
  const items = labelled(flatten(sidebar));
  const symbolGroup = new Map();
  for (const [g, names] of Object.entries(HELIX_GROUPS))
    for (const n of names) symbolGroup.set(n, g);

  const buckets = new Map([...Object.keys(HELIX_GROUPS), "Other"].map((g) => [g, []]));
  for (const it of items) buckets.get(symbolGroup.get(it.text) ?? "Other").push(it);

  return [...Object.keys(HELIX_GROUPS), "Other"]
    .filter((g) => buckets.get(g).length)
    .map((g) => ({ text: g, collapsed: true, items: toItems(buckets.get(g)) }));
};

// spool / twine are small - keep TypeDoc's by-kind grouping, just fix links.
const keepKinds = (sidebar) =>
  sidebar.map((grp) => ({
    text: grp.text,
    collapsed: true,
    items: (grp.items || []).map((it) => ({
      text: it.text,
      link: normLink(it.link),
    })),
  }));

const section = (pkg, groups) =>
  groups && groups.length ? [{ text: pkg, items: groups }] : [];

const helix = readSidebar("helix");
const spool = readSidebar("spool");
const twine = readSidebar("twine");

if (!helix) {
  console.error("group-api: no generated API found - run `npm run gen:api` first.");
  process.exit(0);
}

const sidebar = [
  { text: "API Reference", items: [{ text: "Overview", link: "/api/" }] },
  ...section("helix", groupHelix(helix)),
  ...section("spool", spool && keepKinds(spool)),
  ...section("twine", twine && keepKinds(twine)),
];

writeFileSync(outFile, JSON.stringify(sidebar, null, 2) + "\n");
console.log(`group-api: wrote ${outFile}`);
