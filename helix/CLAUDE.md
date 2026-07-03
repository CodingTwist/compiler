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
- `npm run example` - sync data + run an example from source via `tsx`
  (`src/example/randomtests/example.ts`). The examples read sibling `structures/*.nbt` assets by
  `__dirname`, which `tsc` does not copy into `dist`, so they are run from source, not from a
  `dist` build. **`src/example/` is excluded from `tsc`** (see `tsconfig.json`) - it's tsx-run dev
  scratch.
- `npx tsx src/example/randomtests/example.ts` - run an example directly (same thing, no data sync)
- `npm run gen:commands` - regenerate `src/core/commands/*` + `values/resource.generated.ts` from
  version data (see landmines below)

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
  `CodegenContext`, `Dispatcher`), `command-builder.ts`, `command-validator.ts`, `tree-command.ts`
  (base for generated handlers), `generate.ts` (`generateFunction`/`generateSingleNode` - leaf, no
  barrel import), `variation.ts`, `datapack.ts`.
- **`src/core/commands/`** - **the single home for every command's node + builder + handler.** All
  registered through the generated `createCommandHandlers()` in `index.ts`:
  1. **Generated** (~78 files): the 1:1 vanilla-command mirror, produced by `scripts/gen-commands.mjs`
     from the Brigadier command tree. `<Cmd>Node` + `<Cmd>Builder` + `<Cmd>Handler` (extends
     `TreeCommandHandler`) + a `FunctionContext.prototype` augmentation per file.
  2. **Sugar / semantic** (16 hand-written): `say`, `tellraw`, `give`, `trigger`, `random`,
     `function`, the five `score_*`, `if`, `execute_as`, `execute_store`, `selector`, `data_op`.
     These are NOT 1:1 vanilla commands - their nodes are emitted by the frontend mixins. Registered
     via the generator's `EXTRA_HANDLERS` list, never regenerated.
- **`src/core/codegen/codegen.ts`** - the **pure** build half: `buildDatapack`/`buildResourcePack`
  (→ in-memory `Map<path, contents>`), `buildPackMcmeta`, `createHandlerMap()` (just
  `createCommandHandlers()` → Map by node `type`); re-exports `generate*` from `ir/generate`. It (and
  the whole authoring import graph) imports **no Node built-ins** - that's what lets helix run in a
  browser (see the browser entry below). The resource pack is built here too: `buildResourcePack`
  emits the `assets/` tree (item `Model`s → `models/item` + `items/` definitions, block `Model`s →
  `models/block`, `BlockState`s → `blockstates/`, `resourceFile` JSON) with a *resource-format*
  `pack.mcmeta` (`profile.resourcePack`, distinct from the datapack `pack_format`).
- **`src/core/codegen/write.ts`** - the **disk** half, and the *only* codegen module that imports
  `fs`/`path` (and, via `structure.ts`, `zlib`): `writeDatapack`/`writeResourcePack` (build then write,
  clear stale generated trees, copy `addStructures`/`addAssets` files verbatim). `dp.writeDatapack()`
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
  registries, command tree), `load.ts`, `registry.ts` (runtime id validation), and one `<ver>.ts`
  per supported version (`loadProfile("<ver>.json")`).

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
- **`EXTRA_HANDLERS`** = the 16 sugar handler modules the barrel imports + registers.
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
  `raw(...)` is execute grammar the token validator can't follow past a redirect (see `at_entity.ts`
  / `near_guard.ts`) - and even then the embedded selectors/values are still rendered through their
  typed classes, only the `as`/`if entity`/`run` keywords are raw.
- Tests are colocated `*.test.ts` (vitest), excluded from `tsc` build. Pattern: build a `Datapack`
  with a real profile + `Dispatcher(createHandlerMap())` + `CodegenContext`, assert exact strings on
  `ctx.lines`.
- `tsconfig`: NodeNext ESM, strict, no `resolveJsonModule` (version data is loaded at runtime, not
  imported as JSON). Generate `.ts`, not JSON modules.
- When changing handler behaviour, verify the example output is unchanged unless intended:
  `npx tsx src/example/randomtests/example.ts`.

## Workflow notes

- Work happens on feature branches (current: `version-profiles`); main is `main`.
- Do not commit unless asked.
