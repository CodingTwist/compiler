# CLAUDE.md - twine

Guidance for working in **twine**. Keep it current when conventions change. See the
root [helix/CLAUDE.md](../helix/CLAUDE.md) for the compiler core and the package layout.

## What this is

`twine` is the **opinionated framework layer**: a NestJS-style module / area / lifecycle
system for composing a whole datapack out of features. It sits above `helix` (the
un-opinionated compiler) and `spool` (conveniences) and owns _project composition_ - which
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

Folders group by feature. Each feature is a **builder** (the fluent API an author calls) that
compiles to a **module** (the `DatapackModule` that emits commands).

- [src/core/](src/core/) - the framework itself.
  - `module.decorator.ts` / `module.interface.ts` - `@Module`, `defineModule`, the
    `DatapackModule` lifecycle contract and metadata types.
  - `factory/` - `DatapackFactory`. `mount(dp, Root, { env })` wires the tree into a Datapack
    the `helix` CLI created (how lab builds); `create(Root, opts)` is `mount` over a fresh one.
  - `graph.ts` / `tick-wiring/` / `flags.ts` - module-graph resolution, the tick tree, and
    the `active` flag objective.
  - `area.ts` / `regions.ts` - area triggers and zone geometry.
  - `events/` - `@On` / `@Every`, `EventLatches`, `rearmEvents`, `HandlerGroup`.
  - `env.ts` - the build's one resolved `BuildEnv`. `buildEnv()` falls back to `TWINE_ENV`,
    the factory publishes what it pruned by (`setBuildEnv`), and module bodies gate on `isDev()`,
    so "which modules survive" and "which commands they emit" can't disagree. Never re-read
    `process.env.TWINE_ENV` in a pack.
- [src/mob/](src/mob/) - `defineMob(...).toModule(name)`: wraps spool's `mob` plugin as a module
  (see below).
- [src/boss/](src/boss/) - `defineBoss`: boss fights (see below).
- [src/item/](src/item/) - `defineItem` behavioural items (`builder.ts`, `module.ts`), and
  `registry.ts`: dev-only `debug/give/<name>` functions for plain `ItemValue`s.
- [src/state-machine.ts](src/state-machine.ts) / [src/logger.ts](src/logger.ts) - the
  `StateMachine` helper and the per-player `Logger`.
- [src/index.ts](src/index.ts) - the public barrel. Tests import from source paths, so moving a
  file means updating `tests/` too.

### Boss fights (`src/boss/`)

Composes what already exists: the arena is a plain `area` trigger (entering starts it, the
region emptying is the loss), phases are a `StateMachine` with health-percentage transitions,
and cooldowns are scores on the boss's objective.

- The real mob is the source of truth: its `Health` is mirrored to a 0..100 score each poll
  (divided by a max read at spawn), driving both phase guards and the bar.
- Abilities roll the full int range **modulo** the summed weight of what's off cooldown, since
  `random value` needs a build-time range.
- Death is the entity being _gone_, not health 0. `cleanup` calls `rearmEvents`, which is what
  makes a fight repeatable.

### Custom mobs (`src/mob/`)

The mob itself is spool's `mob` plugin (rig, gestures, states, wake; see
[spool/CLAUDE.md](../spool/CLAUDE.md)). twine's `MobBuilder` extends spool's and adds
`toModule(name, opts)`, which only does the module part:

- `register` calls `mob.register(dp, scope.fn)`, so summon, gestures and wake run in the module's dimension.
- `onTick` is `mob.tick(ctx)`, at the module's `tickEvery`.
- `<name>/wake` runs through `every(module, 20)`, so each mob gets its own clock phase.
- The returned `MobModuleRef` forwards `.summon`, `.spawn`, `.gestures.x`, `.states.x`, `.onTickFn` to the mob.

The difficulty score (`DIFFICULTY`, `setDifficulty`, `defineDifficulty`) is spool's `difficulty`
plugin, re-exported here; `mount` calls `difficulty(dp)` so every twine pack seeds it.

## The module lifecycle (the contract authors implement)

A `DatapackModule` may implement any of:

- `register(dp, scope)` - one-off build-time setup (objectives, standalone functions,
  structures). `scope` is the module's own `{ name, dimension, fn }` (`ModuleScope`):
  `scope.fn(name, body)` creates a function whose body is wrapped in the module's
  dimension, which is what anything called from _outside_ the tick tree (admin
  commands, scheduled one-shots, event rewards) needs - a `dimension` on `@Module`
  only reaches what the framework itself emits.
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
`area: true` module gates its subtree's tick cost behind a presence/region check. The
**root** may be an area itself - it gets the same trigger / `active` gate / presence
disarm a child area does, so a pack that is one gated area needs no wrapper module.

### Event handlers: `@On` / `@Every` ([src/core/events/](src/core/events/))

`@On(detector, opts?)` marks a method as the body that runs when a condition holds.
Vanilla has no change hook, so this compiles to **poll + latch**: one `execute` per
handler, emitted into the module's tick tree (so an inactive ancestor area skips it
for free), with an `unless score #<module>.<method> events matches 1` clause first and
the flag set before the body. `@Every(ticks)` is the same thing with no condition and
no latch - the degenerate case that used to need a module of its own just to carry a
`tickEvery`.

Two things are deliberately the _author's_ choice, not the framework's, because both
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
methods?)` clears latches - nothing re-arms itself. Latches are scoreboard values, so
they **survive a `/reload` and a server restart**: a pack's `reset`/`restart` should call
the generated `<name>/rearm` (emitted for every module with latched handlers, clearing
all of them), or a stale latch silently suppresses its trigger forever.

A module composes `HandlerGroup`s by holding them - discovered by type, from a
field or from an **array** field. Prefer one `groups = [new A(...), new B(...)]` field
when firing order matters: per-field discovery follows _declaration_ order, not the
order the constructor assigns, which is not visible where the groups are built.

### One `minecraft:tick` entry (the framework owns the tick tag)

helix auto-tags _every_ function created with the `tick` tag straight into vanilla
`minecraft:tick` (spool plugins, `defineItem` item ticks, the scoreboard clock). That's the
right un-opinionated default for a plain-helix pack, but the framework collapses it to a
single owned entry: `consolidateTick(dp)` (run automatically at the end of
`DatapackFactory.create`) untags every _other_ member and `function`-calls it from the root
`<ns>:tick` body, so the whole pack's per-tick work is one traceable, gateable list. It's
**idempotent and exported** - if a consumer adds more `tick`-tagged functions _imperatively
after_ `create` (raw helix/spool calls, as `lab/src/pack.ts` does for grapple), call
`consolidateTick(datapack)` again just before `writeDatapack` to sweep those too. Backed by
helix's `dp.untag(name, tag)` / `dp.functionRef(name)` mechanism primitives.

**One call per module, never inlined.** Each ticking module's subtree (its `onTick`, `@On`
polls, child modules, area presence checks) lands in its own `<name>/tick`
(`moduleTick` in `core/tick-wiring/module-tick.ts`). The root tick and each area's `active == 1` gate just
call it, so `tick.mcfunction` stays a short list and each module's cost sits under its own
name. A module imported by several parents is built once. A `<name>/tick` that clashes with
an existing function throws. Tests reading "the tick" should join every
`*/tick.mcfunction`, not only the root file.

**Debug source tracking.** Pass `DatapackFactory.create(Root, { …, debug: { sources, comments } })`.
It's off by default; lab turns it on for dev builds via `helix.config.ts`. Each command then maps to the TS line that
emitted it:

- report `↳`
- `# loc` comments in the pack
- `helix-sources.json`

`core/factory/factory.ts` registers twine (root found as `__dirname/../../..`, so moving that file means updating it) with `ignoreSourceFrames(root, { framework: true })`, so framework
plumbing (tick wiring, mob internals) points at `twine/src/*.ts`, and module bodies point at the
author's module. `sourceMap: true` in tsconfig is what turns the dist frames back into `.ts` lines.
See helix/CLAUDE.md.

## Commands

- `npm run build` - `tsc` (consumers, e.g. `lab`, read the built `dist/`).
- `npm test` / `npx vitest run` - colocated `*.test.ts`.

## Shipped build tooling: `twine-stage-assets` (bin)

[bin/stage-assets.mjs](bin/stage-assets.mjs) is a `bin` a consumer runs after `tsc` in its
own `build` script (`tsc && twine-stage-assets`). Only needed by a pack that runs from
`dist/`; one built with the `helix` CLI runs from source through tsx and needs no staging
(lab no longer uses it). `tsc` emits only `.js`; it drops every
non-source file, so a prod `node dist/main.js` can't find the structure `.nbt` templates
(`dp.addStructures`) or resource-pack `.png` textures (`dp.addAssets`) it registers by
`__dirname`. The bin mirrors them `src/` → `dist/`, preserving paths. It's a **denylist**
(copies anything that isn't a TS/JS source or `.md`), so a consumer never maintains a
per-project extension whitelist. This is framework-owned build plumbing on purpose - asset
staging is a _how-a-pack-is-built_ concern, so it lives here, not re-hand-rolled per
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
