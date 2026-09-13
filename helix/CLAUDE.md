# CLAUDE.md

Guidance for working in this repo. Keep it current when architecture or conventions change.

See [PHILOSOPHY.md](PHILOSOPHY.md) for the governing design principles (typed concepts
not strings, Frontend/IR separation, IR purity). This file covers *how the code is
wired*; that one covers *why*.

## What this is

A TypeScript compiler for Minecraft datapacks. You author a pack in fluent TS; it compiles
**AST → IR → `.mcfunction` files + tag JSON**, targeting a specific Minecraft **VersionProfile** so
the same source emits correct, different output across versions (folder names, pack format, command
grammar, registry membership).

`helix` is the **core**, and its defining stance is that it is **un-opinionated**: it
provides *mechanism* (typed values, commands, codegen for a version), never *policy*. It
ships no "convenient" way to do anything - no bundled gameplay patterns, no opinions about
how a pack is composed. Anything that picks a convention belongs in a layer above. When a
feature feels like a shortcut or a best-practice rather than a primitive, it does **not**
go here.

Two sibling packages live beside it under `/home/sam/compiler` and consume its built
`dist/` via `file:../helix` (symlinked in their `node_modules`). Each owns the opinions
helix refuses to:

- **`spool`** - opt-in convenience plugins built on helix's *public* API. Composed
  shortcuts live here, not in core.
- **`twine`** - the opinionated framework: an NestJS-style module/area/lifecycle system
  that dictates how a whole pack is composed.

Each sibling has its own `CLAUDE.md`; read that for how to work in it. The rule of thumb:
if you're about to add something *helpful* to helix, it probably belongs in `spool` or
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
suffix for non-vanilla; `debug` only in dev). Commands (`cli/run.ts`, flags via `util.parseArgs`):
`build [--prod]`, `dev` (build under `tsx watch`), `report [--strict]`, `profile [dump.json]`
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
  value node lives in `commands/selector.ts`; the score *expression* nodes (`ScoreCompareNode`,
  `ScoreRangeNode`, conditions with no command of their own) live in `commands/if.ts`.
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
  renders through), `command-builder.ts`, `command-validator.ts`, `generate.ts`
  (`generateFunction`/`generateSingleNode` - leaf, no barrel import), `datapack.ts`.
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
  3. **`score-expr`** - the one handler that picks a *backend*. `math\`…\`` (frontend/nodes/math.ts,
     jsep-parsed infix → the `ExprNode` tree in `frontend/nodes/expr.ts`) emits one `ScoreExprNode`
     per destination slot; the handler lowers it to a single `/compute` on 26.3+ and to the
     equivalent `scoreboard players operation` chain below it. Both lowerings live in `score-expr.ts`
     (`toProvider` / `toScoreOps`) so an op is written once, not once per version. `COMPUTE_ONLY_OPS`
     in expr.ts (`sqrt`, `sin`, `cos`, `pow`, `avg`, `round`, `floor`, `ceil`, `len`) and the
     `provider` leaf kind (a `ContextInt`/`ContextFloat` tree interpolated as a `${}` hole - how
     `uniform`/`storage`/`conditional` reach a formula) and a **non-integer `lit`**
     have no scoreboard lowering: `toScoreOps` calls `reject()` for all three, naming the target
     version. Deliberate - they're in the
     formula syntax, and a pre-26.3 target is an author error caught at build time. `FLOAT_OPS`,
     a `ContextFloatProvider` leaf and a fractional literal are the three things that put a node on
     `/compute`'s float side; `toProvider` propagates float-ness up the tree
     and inserts `from_int`/`from_float` at the boundaries only, so an int-only formula renders
     exactly as before and a float one truncates once, at the destination (`toFloatProvider` is the
     variant that skips that last truncation, behind `MathExpr.provider`/`.floatProvider` for a
     non-score `/compute` destination). `Fixed` and
     `ScoreVec3.dot` route through it, so every pack gets `/compute` on 26.3 without opting in.
     Temps are `#_t<depth>` fake players on the destination's own objective - a **reserved prefix**.
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
- **Entity-test limit** (`commands/selector.ts` `renderExistence`): every `if`/`unless entity`
  rendered by the execute chain, `if` links, and the entity/near guards gives an unbounded
  `@e`/`@a` `limit=1`, so the engine stops at the first match instead of scanning every entity.
  Only where the chain goes on to `run` - a bare `store result … if entity @e[…]` is the
  entity-count idiom and is left alone. Guard bodies (`whenPlayerNear`/`whenEntity`) run under
  `runInContext`, so ambient score verbs land inside the guard, not in the parent function.
- **`src/core/codegen/codegen.ts`** - the **pure** build half: `buildDatapack`/`buildResourcePack`
  (→ in-memory `Map<path, contents>`), `buildPackMcmeta`, `createHandlerMap()` (just
  `createCommandHandlers()` → Map by node `type`); re-exports `generate*` from `ir/generate`. It (and
  the whole authoring import graph) imports **no Node built-ins** - that's what lets helix run in a
  browser (see the browser entry below). The resource pack is built here too: `buildResourcePack`
  emits the `assets/` tree (item `Model`s → `models/item` + `items/` definitions, block `Model`s →
  `models/block`, `BlockState`s → `blockstates/`, `resourceFile` JSON) with a *resource-format*
  `pack.mcmeta` (`profile.resourcePack`, distinct from the datapack `pack_format`).
- **Data resources.** Each typed builder in `values/` registers on the `Datapack` and is
  serialized by a loop in `codegen.ts` into its version-aware folder (`paths.lootTable`, …).
  `values/biome.ts` (`BiomeDef`) is the one that carries real format drift - `carvers` became a
  flat list in 1.21.2 (4058), `music` a weighted list in 1.21.4 (4174), `dry_foliage_color`
  arrived in 1.21.5 (4316), and in 1.21.11 / 25w42a (4654) the ambience fields left `effects`
  for the **environment-attribute map** (`attributes`, keyed `minecraft:visual/fog_color`,
  `minecraft:audio/ambient_sounds`, …). The author-facing setters are version-agnostic;
  `toJson` decides the half. Biomes are also the one registry whose registered name is
  **namespace-aware** (`dp.biome("minecraft:plains", …)` overrides vanilla) - see
  `splitDefName` in `ir/datapack.ts`.
- **`src/core/codegen/write.ts`** - the **disk** half, and the *only* codegen module that imports
  `fs`/`path` (and, via `structure.ts`, `zlib`): `writeDatapack`/`writeResourcePack` (build, then
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
  `dp.itemDefinition(name, ItemModel)` the full typed union (`values/item-model.ts` - `ItemModel`
  `model`/`composite`/`condition`/`select`/`range_dispatch`/`empty`/`special`, `TintSource`,
  `SpecialModel`, property-id enums, each with a `.raw()` escape). Both feed one `itemDefinitionDefs`
  registry that codegen serializes via `serializeItemDef`. `dp.blockModel`/`dp.blockState`
  are the block-side file mechanism (blockstate files *override an existing block's* appearance -
  there is no vanilla "new block", so the custom-block *technique* is spool policy, not core).

### Cost report NBT-read warnings (`src/core/report/cost-report.ts`)

`dp.report()` also lists every entity/block NBT read (`nbt=`, `data get`, `if data`,
`from entity|block`) reachable from `tick`, with its cadence read off helix's own clock
gates (`if score t<N> clock matches <k>`, nested gates by lcm). Faster than t5
(`NBT_READ_MIN_PERIOD`) → `warnings`, unless `dp.allowNbtRead(fn, reason)` covers it; an
allow inherits down the call tree (so it covers `execute … run` child functions). Static:
an event-driven function called from the tick tree looks per-tick - allow it where the
caller knows better.

It also runs the Minecraft Wiki's *Optimizing a data pack* checks as `lints` (`WARN <rule>`,
identical findings in one function collapsed into `count`). **Exact** rules flag a line that has
an equivalent cheaper form and check every function: `vacuous-execute`, `fold-into-selector`
(`as <sel> if score|entity @s…` right after `as`, skipped across `limit`/`sort`),
`redundant-as` (an allowlist of multi-target commands), and `macro-score-set`. **Tick-only**
rules: `nbt-write` (only fields a command can set: item/Rotation/Pos/Tags/effects/attributes),
`missing-type`, `repeated-selector` (positional selectors are keyed by their execute context),
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

### JSON validation (`src/validate/mcdoc.ts`) - optional

`validateDatapack(dp, opts?)` checks the pack's emitted JSON resources against the *vanilla
schema* for `dp.version.id`, returning `McdocDiagnostic[]` (`formatMcdocDiagnostics` pretty-prints).
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
  run from the helix package root. The bin handles it *before* importing `dist` (importing helix
  eagerly loads every profile, which throws while data is missing). The npm `files` list excludes
  `dist/versions/data` and ships just the scripts it needs.
- It also generates `src/versions/data/ids.ts` (the `Blocks`/`Items`/`Effects`/… const namespaces)
  - also gitignored, regenerated on every `sync`.
- **Consequence:** a fresh checkout shows IDE squiggles on `versions/data/*` imports until the first
  `npm run build`/`npm test`. This is expected.

## Generator landmines (`scripts/gen-commands.mjs`)

- It **rewrites every `src/core/commands/*.ts` and `index.ts`** on each run.
- **`HAND_REFINED`** (currently `{ "setblock", "data" }`) = hand-written command files it must keep,
  not overwrite. If you hand-write a command file, add it here or the next run destroys it.
- **`HAND_WRITTEN_ELSEWHERE`** = vanilla command names whose frontend is the sugar layer; not
  generated.
- **`EXTRA_HANDLERS`** = the sugar handler modules the barrel imports + registers.
- **`CONSOLE_ONLY`** = vanilla commands that are legal in a function but useless to a datapack
  (moderation, save/publish, profiling, chat); not generated.
- **`AUGMENT_ONLY`** = hand-written modules the barrel re-exports for their `ctx.<method>`
  augmentation but that register no handler.
- **`EXTRA_RESOURCE_TYPES`** = resource types `values/resource.generated.ts` must keep even when
  no *generated* command argument names their registry. `RESOURCE_TYPES` is collected while
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
  `raw(...)` is execute grammar the token validator can't follow past a redirect (see `execute.ts`
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
