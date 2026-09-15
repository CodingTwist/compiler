# CLAUDE.md

Guidance for working in this repo. Keep it current when architecture or conventions change.

See [PHILOSOPHY.md](PHILOSOPHY.md) for the governing design principles (typed concepts
not strings, Frontend/IR separation, IR purity). This file covers _how the code is
wired_; that one covers _why_.

## What this is

A TypeScript compiler for Minecraft datapacks. You author a pack in fluent TS; it compiles
**AST → IR → `.mcfunction` files + tag JSON**, targeting a specific Minecraft **VersionProfile** so
the same source emits correct, different output across versions (folder names, pack format, command
grammar, registry membership).

`helix` is the **core**, and its defining stance is that it is **un-opinionated**: it
provides _mechanism_ (typed values, commands, codegen for a version), never _policy_. It
ships no "convenient" way to do anything - no bundled gameplay patterns, no opinions about
how a pack is composed. Anything that picks a convention belongs in a layer above. When a
feature feels like a shortcut or a best-practice rather than a primitive, it does **not**
go here.

Two sibling packages live beside it under `/home/sam/compiler` and consume its built
`dist/` via `file:../helix` (symlinked in their `node_modules`). Each owns the opinions
helix refuses to:

- **`spool`** - opt-in convenience plugins built on helix's _public_ API. Composed
  shortcuts live here, not in core.
- **`twine`** - the opinionated framework: an NestJS-style module/area/lifecycle system
  that dictates how a whole pack is composed.

Each sibling has its own `CLAUDE.md`; read that for how to work in it. The rule of thumb:
if you're about to add something _helpful_ to helix, it probably belongs in `spool` or
`twine` instead.

**Consequence:** after changing helix source you must `npm run build` here before consumers
see new types/behaviour - a stale dist silently hides breaking type changes.

## Commands

- `npm run build` - `node scripts/versions.mjs sync && rm -rf dist && tsc && node scripts/copy-data.mjs`
- `npm test` / `npx vitest run` - vitest (`pretest` runs `versions.mjs sync` first)
- `npm run gen:commands` - regenerate `src/core/commands/*` + `values/resource.generated.ts` from
  version data (see landmines below)
- `npm run gen:entity-nbt` - regenerate `values/entities.generated.ts` (a typed NBT concept per
  entity - `Tnt`, `Zombie`, …) + `values/entity-versions.generated.ts` (the `since`/`until`
  gate table) from **vanilla-mcdoc**, cached in gitignored `scripts/.cache/`. Both outputs are
  committed, so a normal build needs no network; re-run it when a Minecraft version lands.
  Curated fields the parser can't infer (`blockState` → `BlockValue`) live in the script's
  `OVERRIDES`; `entities.ts` keeps only the raw-NBT warning. A field mcdoc marks
  `#[id="<registry>"]` takes helix's **typed concept** for that registry
  (`AttributeInstance({ id: Attribute.MAX_HEALTH })`, not an id string) - the pairing is
  read off `resource.generated.ts`, so a registry with no concept stays a string.

## The `helix` CLI (`bin/helix.mjs`, `src/cli/`)

Packs don't create or write a Datapack themselves. A pack has a `helix.config.ts`
(`defineConfig({ name, version, entry, targets?, out: { datapack, resourcePack? }, world?, debug? })`)
and an entry whose default export is `definePack((dp, build) => …)`. `loadPack` (`cli/load.ts`) loads
`.env` beside the config, imports both, and creates one `Datapack` per target (`-<target>` output
suffix for non-vanilla; an `out.datapack` ending in `.zip` is zipped; `debug` only in dev). Commands (`cli/run.ts`, flags via `util.parseArgs`):
`build [--prod]`, `dev` (build under `tsx watch`), `report [--strict] [--json]` (`--json` forces `debug.sources`, prints `{ root, packs: [{ target,
lints, warnings, staleAllows }] }` as the only stdout line - pack `console.log`s go to stderr - for
the `vscode/` extension), `profile [dump.json]`
(newest `<world>/helix-profile/profile-*.json` via `latestProfile`; world defaults to two above
`out.datapack`), `validate`. Builds print only the output path - reporting is opt-in.

- The bin **re-execs itself under tsx's CLI** (`HELIX_CLI_CHILD`). Don't swap that for
  `tsx/esm/api` `register()`/`tsImport` in-process: on Node 20 in a CJS package, `register()` hits
  `ERR_REQUIRE_CYCLE_MODULE` and a second namespaced `tsImport` breaks. `tsx` is a runtime dependency.
- `loadPack` itself is a plain `import()`, so it only works under a TS-capable loader (the bin, vitest).
- Node-only: exported from `index.ts`, never `browser.ts`.

## Architecture

- **No `src/core/ast/` folder.** Every node lives **with its handler** in `src/core/commands/<cmd>.ts`.
  The only shared node vocabulary - base classes (`ASTNode`, `ExpressionNode`, `CommandNodeBase`,
  `CommandPart`, `FunctionNode`, `Range`) - lives in **`src/core/ir/node.ts`**. The `SelectorNode`
  value node lives in `commands/selector.ts`; the score _expression_ nodes (`ScoreCompareNode`,
  `ScoreRangeNode`, conditions with no command of their own) live in `commands/if/`.
- **`src/core/frontend/`** - the author-facing fluent API.
  - `context/` - only `base.ts` (`ContextBase`: emit/call/version/child-function plumbing) and
    `index.ts` (`FunctionContext extends ContextBase`). **No command methods live here.** Every
    `ctx.<command>()` - sugar (`say`, `tellraw`, score ops, `if`, `give`, `random`, `trigger`) and
    vanilla alike - is a `FunctionContext.prototype` augmentation in its own `commands/<cmd>.ts`,
    installed via `import "../commands"` (done by the frontend barrel).
  - `nodes/*.ts` - builder/value classes (Selector, Text, Score, tellraw parts, `NbtRef`).
  - `values/` lives under `src/core/values/` - domain value types (`Pos`, `Block`, `Nbt`, `Item`,
    `Id`, `Path`) that render version-aware at codegen.
- **`src/core/ir/`** - codegen infrastructure: `commandhandler.ts` (`CommandHandler` base,
  `CodegenContext`, `Dispatcher`, and the shared `TreeCommandHandler` every mechanical command
  renders through), `command-builder/`, `command-validator.ts`, `generate.ts`
  (`generateFunction`/`generateSingleNode` - leaf, no barrel import), `datapack/`.
- **`src/core/commands/`** - **the single home for every command's node + builder + handler.** All
  registered through the generated `createCommandHandlers()` in `index.ts`:
  1. **Generated** (~51 files): the 1:1 vanilla-command mirror, produced by `scripts/gen-commands.mjs`
     from the Brigadier command tree. Each file is just a `<Cmd>Builder` + a
     `FunctionContext.prototype` augmentation - there is **no node or handler class per command**:
     they all emit a plain `TreeCommandNode(<cmd>)`, which the dispatcher renders with the one
     shared `TreeCommandHandler`. Server-console commands (ban/op/kick/save/publish/profiling/chat)
     are skipped entirely - see `CONSOLE_ONLY` in the generator.
  2. **Sugar / semantic** (hand-written): `say`, `tellraw`, `give`, `trigger`, `random`,
     `function`, `scoreboard` (the whole score family in one file), `if`, `execute` (the general
     chain, plus the `atEntity`/`whenItems` sugar), `execute_as`, `entity_guard`, `near_guard`,
     `selector`, `data_op`, `native`. These are NOT 1:1 vanilla commands - their nodes are emitted
     by the frontend mixins. Registered via the generator's `EXTRA_HANDLERS` list, never regenerated.
  3. **`score-expr`** - the one handler that picks a _backend_. `math\`…\``(frontend/nodes/math/,
jsep-parsed infix → the`ExprNode`tree in`frontend/nodes/expr.ts`) emits one `ScoreExprNode`per destination slot; the handler lowers it to a single`/compute`on 26.3+ and to the
equivalent`scoreboard players operation`chain below it. Both lowerings live in`score-expr/`
(`toProvider`/`toScoreOps`) so an op is written once, not once per version. `COMPUTE_ONLY_OPS`
in expr.ts (`sqrt`, `sin`, `cos`, `pow`, `avg`, `round`, `floor`, `ceil`, `len`) and the
`provider`leaf kind (a`ContextInt`/`ContextFloat`tree interpolated as a`${}`hole - how`uniform`/`storage`/`conditional`reach a formula) and a **non-integer`lit`**
have no scoreboard lowering: `toScoreOps`calls`reject()`for all three, naming the target
version. Deliberate - they're in the
formula syntax, and a pre-26.3 target is an author error caught at build time.`FLOAT_OPS`,
a `ContextFloatProvider`leaf and a fractional literal are the three things that put a node on`/compute`'s float side; `toProvider`propagates float-ness up the tree
and inserts`from_int`/`from_float` at the boundaries only, so an int-only formula renders
exactly as before and a float one truncates once, at the destination (`toFloatProvider`is the
variant that skips that last truncation, behind`MathExpr.provider`/`.floatProvider`for a
non-score`/compute`destination).`Fixed`and`ScoreVec3.dot`route through it, so every pack gets`/compute`on 26.3 without opting in.
Temps are`#\_t<depth>` fake players on the destination's own objective - a **reserved prefix**.
- **Function macros.** `Macro<T>("name")` (`values/macro.ts`) is a `CommandValue` rendering
  `$(name)`; `CodegenContext.emit` prefixes any line containing `$(` with `$`, so every
  handler gets macro lines right without knowing about them (`generateRunTarget` strips the
  `$` when inlining a body so the prefix ends up on the composed `execute … run` line, and
  the validator skips a leading `$`). Call one with `ctx.callWith(fn, Nbt({…}) | NbtRef)`
  (`MacroCallNode` in `commands/function.ts`).
- **Run-clause peepholes** (`ir/generate.ts`): `generateRunTarget` inlines a one-line body, and
  `runClause` splices a body that is itself an `execute` chain into the parent's clauses
  (`execute A run execute B run c` → `execute A B run c`). An empty body renders `""` and the
  `execute`/`if` handlers drop the whole line, unless a `store` clause needs its result.
- **if/elif/else** (`commands/if/handler.ts`): a lone `if` folds into one `execute` chain. With
  `elif`/`else` the whole chain becomes a private `<then>_chain` function of `execute if <cond> run
return run <body>` lines ending in the `else` body, so exactly one branch runs and no condition is
  checked after a body changed it. Bodies that fork or `return` stay function calls under `return
run`. Versions without `return run` (1.20.1) record the branch number in a local: every
  condition sets it unless an earlier one did, then each body runs under its number.
- **Locals** (`commands/local.ts`): `ctx.let(init?)` returns a Score `#<root fn>.<n>` on
  `helix.var`. Child bodies share their root's counter via `FunctionNode.root`, so any code that
  makes a scratch `FunctionNode` must set `root`. The objective is declared at load only if some
  function used a local. Not safe under recursion.
- **Refs** (`commands/ref.ts`): `ctx.ref(target, (c, ref) => …)` tags `target` with
  `helix.ref.<root fn>.<n>` around the body, and `ref()` finds it again under any `execute as`.
  Inline, no child function: the tag comes off `@s` (or `@e[tag=…]` for other selectors) after the
  body, so a bare `return` in the body leaves it on. `ref()` copies the target's `type=`.
- **Loops** (`commands/loop.ts`): `ctx.while(cond, body, { advance }).else(exit)` and
  `ctx.repeat(n, body)`. The loop function is the if handler's branch lines (`branchLines`, with
  the else under `return run`): `if cond run return run function pass`, then the exit. `pass` is
  the body plus `execute <advance> run return run function <loop>`, so a `return` in the body or
  exit reaches the loop's caller. Needs `return run`; throws on 1.20.1.
- **Nameless functions** (`ir/datapack/functions.ts`): `dp.createFunction()` / `dp.fn(body)`
  with no name get a private one - `privateChild(<function being built>, "fn_N")`, or
  `<group>/zzz/fn_N` inside `dp.group(name, body)`, else `zzz/fn_N` - so authors only name
  functions whose id is used outside the code, and the output still groups by feature.
- **Score functions** (`dp.fn` in `ir/datapack/functions.ts`, `ctx.invoke` in
  `commands/function.ts`): params are the callee's first locals, counted from `body.length`; a
  returned score becomes `return run scoreboard players get`, stored by the caller with
  `execute store result score`. A result needs `return run`, so it throws on 1.20.1.
- **Conditions** (`commands/if/normalize.ts`): `ctx.if` takes score nodes, `Detector`s, and
  `and`/`or`/`not` of them. Detectors run once in `ctx.if` to record their clauses. `toChains`
  flattens everything to OR-of-AND clause chains, pushing `not` down to `unless` (forking or store
  clauses can't be negated). One chain folds like before; an `or` goes through the `_chain`
  function, one `return run` line per chain, so the body runs once. `and` puts a chain that moves
  position last so it can't shift the other guards.
- **Single-command inlining** (`codegen/inline.ts`, end of `buildDatapack`): a _private_
  (`zzz/`) function with one command is spliced into its `function` / `execute … run function`
  / `return run function` call sites, and dropped if nothing else names it (tags, JSON,
  `schedule`, `if function`). Skipped: macro or `return` bodies, `store` callers, functions
  with a `dp.allow`, and forking bodies (`as`/`at`/`on`/`summon`) under `return run`, which
  stops after the first branch. Public functions are never touched. Dropped names go in
  `dp.inlined` so a rebuild doesn't regenerate them.
- **Line info** (`ir/line-info.ts`): every emitted line carries a `LineInfo` (its shareable
  leading clauses, its `Effect` on entities, the functions it calls, whether it `return`s),
  kept in `dp.lineInfo` beside `dp.files`. Handlers fill it from typed values
  (`SelectorNode.picksOne()`/`picksRandomly()`/`isBareSelf()`, `NbtPath.within`, `Relation`),
  never by reading text. `ctx.emit(line)` without info is unknown and blocks every pass;
  inlining and grouping keep it up to date.
- **Execute-prefix grouping** (`codegen/group/`, right after inlining): consecutive lines
  sharing leading context clauses (`at`/`as`/`positioned`/`rotated`/`facing`/`in`/`align`/
  `anchored`/`on`) become `execute <prefix> run function <fn>/zzz/group_<n>`, read entirely from
  `dp.lineInfo`. Only when sound: every prefix selector picks one entity, never randomly, and
  tests no scores/NBT/predicates; no `return`/macro lines; and no line before the last can
  change what the prefix resolves to - `at @s`-style clauses block on `Effect.MOVES`, other
  selectors on anything but `Effect.NONE` (calls followed through their bodies). Forks (`on
passengers`, multi-entity `as`) are shared only when every line is `local` (touches only `@s`),
  since the group then runs whole per entity. Needs ≥3 lines, or ≥2 when the prefix scans or forks. Runs declined as unsafe still show up as the `group-execute` lint.
- **Turning passes off**: `new Datapack(..., { optimize: { inline: false, group: false } })` or
  `optimize` in `helix.config.ts` (every mode) skips that pass in `buildDatapack`.
- **Entity-test limit** (`commands/selector.ts` `renderExistence`): every `if`/`unless entity`
  rendered by the execute chain, `if` links, and the entity/near guards gives an unbounded
  `@e`/`@a` `limit=1`, so the engine stops at the first match instead of scanning every entity.
  Only where the chain goes on to `run` - a bare `store result … if entity @e[…]` is the
  entity-count idiom and is left alone. Guard bodies (`whenPlayerNear`/`whenEntity`) run under
  `runInContext`, so ambient score verbs land inside the guard, not in the parent function.
- **`src/core/codegen/codegen.ts`** - the **pure** build half: `buildDatapack` (plus
  `resource-pack.ts`'s `buildResourcePack` and `mcmeta.ts`'s `buildPackMcmeta`, all → in-memory
  `Map<path, contents>`), `createHandlerMap()` (just
  `createCommandHandlers()` → Map by node `type`); re-exports `generate*` from `ir/generate`. It (and
  the whole authoring import graph) imports **no Node built-ins** - that's what lets helix run in a
  browser (see the browser entry below). The resource pack is built here too: `buildResourcePack`
  emits the `assets/` tree (item `Model`s → `models/item` + `items/` definitions, block `Model`s →
  `models/block`, `BlockState`s → `blockstates/`, `resourceFile` JSON) with a _resource-format_
  `pack.mcmeta` (`profile.resourcePack`, distinct from the datapack `pack_format`).
- **Data resources.** Each typed builder in `values/` registers on the `Datapack` and is
  serialized by a loop in `codegen.ts` into its version-aware folder (`paths.lootTable`, …).
  `values/biome/` (`BiomeDef`) is the one that carries real format drift - `carvers` became a
  flat list in 1.21.2 (4058), `music` a weighted list in 1.21.4 (4174), `dry_foliage_color`
  arrived in 1.21.5 (4316), and in 1.21.11 / 25w42a (4654) the ambience fields left `effects`
  for the **environment-attribute map** (`attributes`, keyed `minecraft:visual/fog_color`,
  `minecraft:audio/ambient_sounds`, …). The author-facing setters are version-agnostic;
  `toJson` decides the half. Biomes are also the one registry whose registered name is
  **namespace-aware** (`dp.biome("minecraft:plains", …)` overrides vanilla) - see
  `splitDefName` in `ir/datapack/data.ts`.
- **`src/core/codegen/write/`** - the **disk** half, and the _only_ codegen module that imports
  `fs`/`path` (and, via `structure/`, `zlib`): `writeDatapack`/`writeResourcePack` (build, then
  `syncFiles` the owned trees - `data/<ns>/`, `assets/<ns>/models|items` - writing only files whose
  content changed and deleting anything the build no longer produces; `addStructures`/`addAssets`
  files are copied verbatim). `dp.writeDatapack()`
  /`dp.writeResourcePack()` reach it via a lazy **dynamic `import("./write.js")`** (so the methods are
  `async`), keeping Node built-ins off the pure graph. A resource pack is a **separate** output pack -
  `dp.writeResourcePack(path)`, not folded into `writeDatapack`.
- **Two entry points.** `src/public-api.ts` is the environment-agnostic surface (no Node built-ins on
  its graph). `src/index.ts` (Node, the default `helix` import) = `public-api` + the eager disk-backed
  version constants (`v1_21_4`, …, which `loadProfile` from disk at import) + `validateDatapack`.
  `src/browser.ts` (the `helix/browser` export) = `public-api` only; build a `VersionProfile` at
  runtime from fetched mcmeta JSON with `profileFromRaw` (pure, in `versions/raw-profile.ts`; the
  disk-reading `loadProfile` stays in `versions/load.ts`). The docs playground consumes `helix/browser`.
  Attach a model to an item with `Item.X.model(dp.model(...))` → the `item_model` component (1.21.4+)
  or a legacy `custom_model_data` fallback - never a magic number. The `assets/<ns>/items/<name>.json`
  **item definition** is a first-class value: `dp.model(name, Model)` is the flat single-model case,
  `dp.itemDefinition(name, ItemModel)` the full typed union (`values/item-model/` - `ItemModel`
  `model`/`composite`/`condition`/`select`/`range_dispatch`/`empty`/`special`, `TintSource`,
  `SpecialModel`, property-id enums, each with a `.raw()` escape). Both feed one `itemDefinitionDefs`
  registry that codegen serializes via `serializeItemDef`. `dp.blockModel`/`dp.blockState`
  are the block-side file mechanism (blockstate files _override an existing block's_ appearance -
  there is no vanilla "new block", so the custom-block _technique_ is spool policy, not core).

### Cost report NBT-read warnings (`src/core/report/cost/`)

`index.ts` is the entry; `analyze.ts` builds the report, `format.ts` prints it, and the wiki
lints live in `lints/` (`exact.ts` for every function, `tick.ts` for tick-reachable code).

`dp.report()` also lists every entity/block NBT read (`nbt=`, `data get`, `if data`,
`from entity|block`) reachable from `tick`, with its cadence read off helix's own clock
gates (`if score t<N> clock matches <k>`, nested gates by lcm). Faster than t5
(`NBT_READ_MIN_PERIOD`) → `warnings`, unless `dp.allowNbtRead(fn, reason)` covers it; an
allow inherits down the call tree (so it covers `execute … run` child functions). Static:
an event-driven function called from the tick tree looks per-tick - allow it where the
caller knows better.

It also runs the Minecraft Wiki's _Optimizing a data pack_ checks as `lints` (`WARN <rule>`,
identical findings in one function collapsed into `count`). **Exact** rules flag a line that has
an equivalent cheaper form and check every function: `vacuous-execute`, `fold-into-selector`
(`as <sel> if score|entity @s…` right after `as`, skipped across `limit`/`sort`),
`redundant-as` (an allowlist of multi-target commands), `macro-score-set`, `missing-type`
(bare `@e` in tick code is an unbounded scan instead), `constant-condition` (a `matches` check
on a fake player set earlier in the function; any call or other mention forgets the value) and
`group-execute` (≥3 consecutive lines sharing an `if`/`unless`-free execute prefix, ≥2 when it scans). The last three
mirror the datapack-optimization VS Code extension. **Tick-only**
rules: `nbt-write` (only fields a command can set: item/Rotation/Pos/Tags/effects/attributes),
`repeated-selector` (positional selectors are keyed by their execute context),
and `poll-trigger` (stat objectives polled per player, `as @a[…]` in a fixed area, and
inventory-slot polls). Presence checks (`if/unless entity @a[…]`) and `weapon.*` are
deliberately left out, since no trigger replaces them. Keep it precise: a false positive means
tightening the pattern. `dp.allow(rule, fn, why)` silences a rule for `fn` and what it calls,
using the same walk as `allowNbtRead`, which is now `allow("nbt-read", …)`.
A function reached only behind an `if`/`unless` (clock gates aside) prints `up to every N
tick(s)`: the static period is a ceiling there, not a rate. `staleAllows` lists `dp.allow` calls
naming a function the pack doesn't have (after a rename it silently silences nothing).
`helix report --strict` fails on warnings, lints or stale allows.

### Debug source tracking (`src/core/debug/sources.ts`) - off by default

`new Datapack(name, version, target, { debug: { sources, comments } })` maps each rendered
command back to the TS line that authored it. The hook is `FunctionNode.push`: when a debug pack
has enabled capture (process-wide flag), the push reads the JS stack and stores a location keyed
by (parent function, node). Capture takes V8's structured frames (cheap) and formats the
source-mapped string only once per distinct author site (`bySite` memo) - formatting is what
costs, and a loop emitting thousands of commands from one line hits the memo. A call node is the callee's shared `FunctionNode`, so a location
can't live on the node itself. `generate.ts` sets `CodegenContext.current` per node, so every
line gets `ctx.sources[i]`. Validation runs first; then `comments` adds `# <loc>` lines, and
`dp.sourceMap` is indexed by **file line** (`undefined` on comment lines). Uses:

- the cost report's `↳ <loc>` on WARNs and `@e` scans
- `writeDatapack` writes `helix-sources.json` at the pack root, and deletes it when debug is off

Frames under helix are skipped. Other packages register with `ignoreSourceFrames(dir)`, with
two behaviours:

- plain (spool): a line is attributed to whoever called the plugin;
- `{ framework: true }` (twine): a line twine emits itself points at twine, not at the shared
  `DatapackFactory.create` call.

`*.test.ts` frames always count as the author. Both flags off means no capture and output
byte-identical to a normal build.

### JSON validation (`src/validate/`) - optional

`validateDatapack(dp, opts?)` checks the pack's emitted JSON resources against the _vanilla
schema_ for `dp.version.id`, returning `McdocDiagnostic[]` (`formatMcdocDiagnostics` pretty-prints).
It reads **rendered output** (`buildDatapack(dp)` → temp datapack root), same stance as `dp.report()`,
never the AST - and is aimed at the `dp.registryFile(...)` raw-JSON seam (pass
`registryFilesOnly: true` to scope to just those; default validates every emitted `.json`, which also
cross-checks the typed builders).

- Backed by **Spyglass's mcdoc runtime** (`@spyglassmc/core` + `mcdoc` + `java-edition`) driving
  **misode's [vanilla-mcdoc](https://github.com/SpyglassMC/vanilla-mcdoc)** schemas. Version-awareness
  is real: `env.gameVersion` picks folder conventions (`loot_table` vs `loot_tables`), registry-set
  membership (from the mcmeta summary), and `#[since]`/`#[until]` field gating.
- These three packages are **`optionalDependencies`, loaded via lazy `import()`** - the core compiler
  and all consumers never load Spyglass unless `validateDatapack` is actually called. It throws an
  install hint if they're absent.
- First run per version fetches vanilla-mcdoc + the mcmeta summary into `~/.cache/helix-mcdoc`
  (override with `cacheDir`); after that it's offline. Boot cost is ~12s **per call regardless**
  (parsing the full symbol set), so validate a whole pack in one call - the API boots the Spyglass
  project once and checks every file.

### Import-cycle constraint (don't break this)

Command files are imported by the frontend context mixins (which need their nodes), so a command file
**must stay leaf-importable**: it may import `ast/base`, `ast/selector`, `ast/score`, `values/`,
`ir/commandhandler`, `ir/command-builder`, `ir/generate`, and leaf `frontend/nodes/*` - but NOT
`codegen.ts` (drags the commands barrel) or `frontend/data.ts` (runs a `FunctionContext.prototype`
augmentation). That's why `generate*` lives in leaf `ir/generate.ts`, `NbtRef` in leaf
`frontend/nodes/nbt_ref.ts`, and `commandhandler.ts` imports `Datapack` as `import type`. Importing a
node would otherwise pull a `FunctionContext` augmentation before `FunctionContext` is defined.

- **`src/versions/`** - `profile.ts` (`VersionProfile`: id, dataVersion, pack spec, paths,
  registries, command tree), `load.ts`, `registry.ts` (runtime id validation), and the generated
  `profiles.ts` - one `loadProfile("<ver>.json")` const per supported version, rewritten by
  `scripts/versions.mjs sync` from `scripts/supported-versions.json`.

### Core invariant

Version data reaches handlers **only** through `ctx.datapack.version` (a.k.a. `ctx.version`) at call
time. Handlers are **stateless singletons**. Never pass a version into a handler constructor or
rebuild the handler map per version.

### Division of responsibility

- **Types / const namespaces** (e.g. `Blocks.stone`, `Path.Entity.Health`) = authoring ergonomics
  (autocomplete), sourced from the newest supported version as a superset.
- **Runtime registry validation** (`src/versions/registry.ts`, used in handlers like `give`) = the
  per-version correctness authority. Don't conflate the two.

## Version data pipeline (important)

- `scripts/versions.mjs sync` fetches Mojang-derived data from misode/mcmeta into
  `src/versions/data/*.json` - **gitignored, NOT committed/shipped.** `sync` runs before every build
  and test, and skips versions already present (so a normal build needs no network).
- **`helix data [--force]`** is the consumer-facing wrapper: `versions.mjs sync` + `copy-data.mjs`,
  run from the helix package root. The bin handles it _before_ importing `dist` (importing helix
  eagerly loads every profile, which throws while data is missing). The npm `files` list excludes
  `dist/versions/data` and ships just the scripts it needs.
- It also generates `src/versions/data/ids.ts` (the `Blocks`/`Items`/`Effects`/… const namespaces)
  - also gitignored, regenerated on every `sync`.
- **Consequence:** a fresh checkout shows IDE squiggles on `versions/data/*` imports until the first
  `npm run build`/`npm test`. This is expected.

## Generator landmines (`scripts/gen-commands.mjs`)

- It **rewrites every `src/core/commands/*.ts` and `index.ts`** on each run.
- **`HAND_REFINED`** (currently `setblock`, `data`, `stopsound`, `summon`) = hand-written command files it must keep,
  not overwrite. If you hand-write a command file, add it here or the next run destroys it.
- **`EFFECTS`** = what each generated command can do to entities, written into its
  `TreeCommandNode`'s traits (`{ effect, exits?, local? }`). Generation throws for a command
  missing from it, so a new Minecraft command must be classified; pick `MOVES` when unsure (it
  only costs grouping). `LOCAL` lists commands that act only on their entity arguments; add one
  only if it never reaches another entity or the world. Hand-refined and
  hand-written handlers pass their own `LineInfo` to `ctx.emit`.
- **`HAND_WRITTEN_ELSEWHERE`** = vanilla command names whose frontend is the sugar layer; not
  generated.
- **`EXTRA_HANDLERS`** = the sugar handler modules the barrel imports + registers.
- **`CONSOLE_ONLY`** = vanilla commands that are legal in a function but useless to a datapack
  (moderation, save/publish, profiling, chat); not generated.
- **`AUGMENT_ONLY`** = hand-written modules the barrel re-exports for their `ctx.<method>`
  augmentation but that register no handler.
- **`EXTRA_RESOURCE_TYPES`** = resource types `values/resource.generated.ts` must keep even when
  no _generated_ command argument names their registry. `RESOURCE_TYPES` is collected while
  rendering, so a registry used only by a `HAND_REFINED` file silently vanishes from the public
  API on the next run - that is how `EntityType` (only `summon` names `minecraft:entity_type`,
  and summon is hand-refined) disappeared once.
- **`PARSERS` must be fed on every Minecraft update.** A parser it doesn't know falls back to
  `string`, so a typed slot silently becomes a stringly one. 26.3 alone added five:
  `context_int_provider` / `context_float_provider` (`/compute`), `feature`, `slot_source`
  (the successor to `item_slot`/`item_slots`), and `swing_animation`. After a `versions.mjs sync`
  to a newer version, diff the **whole** `gen:commands` re-run, not just the new command's file.
- `commandHandlers` is built **lazily** via `createCommandHandlers()` (a function, not a top-level
  array) on purpose: sugar handlers import `codegen.ts`, which imports this barrel - eager
  construction would hit the import cycle before those classes initialise.

## Conventions

- **No hand-built command fragments in handlers ("typed concepts not strings").** Domain values -
  selectors, positions, blocks, items, nbt, ids - must be constructed via their typed value/builder
  classes (`Selector`, `Pos`, `Block`, `Nbt`, …) and rendered version-aware (`toCommandValue(x).render(ctx.version)`),
  never string-interpolated (`@a[distance=..6]`, `0 64 0`, `{Health:20f}`, …). If a handler needs a
  concept the typed API can't yet express, **add it to that API first** (e.g. `Selector.distance()`
  was added so `near_guard` didn't hand-build `@a[distance=..r]`), then compose it. The only allowed
  `raw(...)` is execute grammar the token validator can't follow past a redirect (see `execute/`
  / `near_guard.ts`) - and even then the embedded selectors/values are still rendered through their
  typed classes, only the `as`/`if entity`/`run` keywords are raw.
- Tests are colocated `*.test.ts` (vitest), excluded from `tsc` build. Pattern: build a `Datapack`
  with a real profile + `Dispatcher(createHandlerMap())` + `CodegenContext`, assert exact strings on
  `ctx.lines`.
- `tsconfig`: NodeNext ESM, strict, no `resolveJsonModule` (version data is loaded at runtime, not
  imported as JSON). Generate `.ts`, not JSON modules.

## Workflow notes

- Work happens on feature branches (current: `version-profiles`); main is `main`.
- Do not commit unless asked.
