# CLAUDE.md - twine

Guidance for working in **twine**. Keep it current when conventions change. See the
root [helix/CLAUDE.md](../helix/CLAUDE.md) for the compiler core and the package layout.

## What this is

`twine` is the **opinionated framework layer**: a NestJS-style module / area / lifecycle
system for composing a whole datapack out of features. It sits above `helix` (the
un-opinionated compiler) and `spool` (conveniences) and owns *project composition* - which
features are enabled, how they nest, and when their behaviour runs.

Where helix deliberately refuses to dictate structure, twine **is** the structure: it
says a feature is a decorated module, that modules form a tree, that lifecycle runs
through fixed hooks, and that area ancestry gates tick cost. Embrace those opinions here -
this is the layer that's allowed to have them.

The core idea: a feature is a **module** (a decorated class), the app is a **tree** of
modules wired through `imports`, and `DatapackFactory.create(RootModule, opts)` walks the
enabled tree and emits one datapack. A module **not reachable through `imports` is never
constructed and emits nothing** - that is the compile-time disable.

## Layout

- [src/module.decorator.ts](src/module.decorator.ts) - the `@Module({...})` decorator
  (stores `ModuleMetadata` via `reflect-metadata`), `getModuleMetadata`, and
  `defineModule` / `isConfiguredModule` for the `forFeature`-style configured modules.
- [src/module.interface.ts](src/module.interface.ts) - the `DatapackModule` lifecycle
  contract and the metadata/area types (`ModuleMetadata`, `ConfiguredModule`, `Zone`,
  `AreaTrigger`, `BuildEnv`, `Vec3`).
- [src/factory.ts](src/factory.ts) - `DatapackFactory`: instantiate the tree, run the
  lifecycle, produce the `Datapack`.
- [src/graph.ts](src/graph.ts) / [src/regions.ts](src/regions.ts) /
  [src/state-machine.ts](src/state-machine.ts) / [src/tick-wiring.ts](src/tick-wiring.ts) /
  [src/flags.ts](src/flags.ts) - module-graph resolution, area/zone geometry, the
  `StateMachine` helper, shared tick/load wiring, and the active-flag objective.
- [src/item.ts](src/item.ts) - `defineItem` / `ItemBuilder`: custom behavioural items.
- [src/index.ts](src/index.ts) - the public barrel.

## The module lifecycle (the contract authors implement)

A `DatapackModule` may implement any of:

- `register(dp)` - one-off build-time setup (objectives, standalone functions, structures).
- `onLoad(ctx)` - appended to the shared `load` function; always runs (not gated).
- `onTick(ctx)` - appended to the shared `tick` function, but **only reached while every
  `area` ancestor is active** - the parent's single `active` check skips the whole subtree
  for free when dormant. Put per-tick work here.
- `onActivate(ctx)` / `onDeactivate(ctx)` - edge functions for an `area` module
  (`<name>/activate` / `<name>/deactivate`), e.g. summon / despawn a level's entities.

`@Module({ name, area?, activeByDefault?, imports?, env? })` declares the module; an
`area: true` module gates its subtree's tick cost behind a presence/region check.

### One `minecraft:tick` entry (the framework owns the tick tag)

helix auto-tags *every* function created with the `tick` tag straight into vanilla
`minecraft:tick` (spool plugins, `defineItem` item ticks, the scoreboard clock). That's the
right un-opinionated default for a plain-helix pack, but the framework collapses it to a
single owned entry: `consolidateTick(dp)` (run automatically at the end of
`DatapackFactory.create`) untags every *other* member and `function`-calls it from the root
`<ns>:tick` body, so the whole pack's per-tick work is one traceable, gateable list. It's
**idempotent and exported** - if a consumer adds more `tick`-tagged functions *imperatively
after* `create` (raw helix/spool calls, as `lab/src/main.ts` does for grapple), call
`consolidateTick(datapack)` again just before `writeDatapack` to sweep those too. Backed by
helix's `dp.untag(name, tag)` / `dp.functionRef(name)` mechanism primitives.

## Commands

- `npm run build` - `tsc` (consumers, e.g. `lab`, read the built `dist/`).
- `npm test` / `npx vitest run` - colocated `*.test.ts`.

## Shipped build tooling: `twine-stage-assets` (bin)

[bin/stage-assets.mjs](bin/stage-assets.mjs) is a `bin` a consumer runs after `tsc` in its
own `build` script (`tsc && twine-stage-assets`). `tsc` emits only `.js`; it drops every
non-source file, so a prod `node dist/main.js` can't find the structure `.nbt` templates
(`dp.addStructures`) or resource-pack `.png` textures (`dp.addAssets`) it registers by
`__dirname`. The bin mirrors them `src/` → `dist/`, preserving paths. It's a **denylist**
(copies anything that isn't a TS/JS source or `.md`), so a consumer never maintains a
per-project extension whitelist. This is framework-owned build plumbing on purpose - asset
staging is a *how-a-pack-is-built* concern, so it lives here, not re-hand-rolled per
consumer (and not in helix, which ships no consumer conveniences). Args:
`twine-stage-assets [srcDir=src] [distDir=dist]`.

## Conventions

- `reflect-metadata` must be imported once at the app entry before any decorator metadata
  is read (the `lab` entry does `import "reflect-metadata"` first).
- Build feature behaviour on **helix typed primitives** (and `spool` plugins) - same
  "typed concepts, not strings" rule as the rest of the stack.
- A feature needing per-use config exposes a **factory returning a `ConfiguredModule`**
  (`defineModule`), so the same feature can be `imports`-ed many times with different
  settings (see the `lab` door / dialogue / quest modules).
- After changing twine source, `npm run build` before `lab` sees it.
