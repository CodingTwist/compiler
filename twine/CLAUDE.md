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
- [src/events.ts](src/events.ts) - the `@On` / `@Every` method decorators, the
  per-handler latch objective (`EventLatches`), and `rearmEvents`.
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
- `defineFunction(dp, name, body)` - optional: how an `@On({ name })` body becomes a
  function, so a pack can apply its own conventions (trace line, tag, naming). Defaults
  to a plain `dp.createFunction`.

`@Module({ name, area?, activeByDefault?, imports?, env? })` declares the module; an
`area: true` module gates its subtree's tick cost behind a presence/region check.

### Event handlers: `@On` / `@Every` ([src/events.ts](src/events.ts))

`@On(detector, opts?)` marks a method as the body that runs when a condition holds.
Vanilla has no change hook, so this compiles to **poll + latch**: one `execute` per
handler, emitted into the module's tick tree (so an inactive ancestor area skips it
for free), with an `unless score #<module>.<method> events matches 1` clause first and
the flag set before the body. `@Every(ticks)` is the same thing with no condition and
no latch - the degenerate case that used to need a module of its own just to carry a
`tickEvery`.

Two things are deliberately the *author's* choice, not the framework's, because both
are where per-tick cost comes from:

- **The detector.** A `Detector` is helix's (`Detect.block/entity/score/predicate`,
  composed with `Detect.all/in/at/near`, or a closure you write). It appends clauses to
  the caller's chain rather than emitting its own, so composing is free - `Detect.all`
  of four things is still one `execute`, and the latch clause merges into it, meaning a
  spent handler costs a score read and never the condition it guards.
- **The cadence.** `opts.every` (default: the module's `tickEvery`) and `opts.phase`.
  Handlers sharing a period share one throttle gate.

`opts.once: false` drops the latch for a body meant to repeat; `opts.name` puts the body
in its own function (via `defineFunction`). `rearmEvents(ctx, dp, moduleName, instance,
methods?)` clears latches - nothing re-arms itself.

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
