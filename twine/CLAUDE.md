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
- [src/boss.ts](src/boss.ts) - `defineBoss` / `BossBuilder`: a boss fight compiled to a
  `ConfiguredModule`. Composes what already exists rather than adding concepts: the arena
  is a plain `area` trigger (so entering starts it and the region emptying is the loss
  condition), phases are a `StateMachine` whose transitions are health-percentage
  thresholds, and cooldowns are scores on the boss's own objective. A real mob is the
  source of truth - its `Health` is mirrored to a 0..100 score each poll (divided by a max
  read once at spawn, so no config field can disagree with the NBT) which drives both the
  phase guards and the bar. Abilities are picked by rolling the full int range **modulo**
  the summed weight of whatever is off cooldown (`random value` needs a build-time literal
  range, so the live total can only enter via the modulo), then walking cumulative
  thresholds. Death is the entity being *gone*, not health 0. `cleanup` calls
  `rearmEvents`, which is what makes a fight repeatable.
- [src/mob.ts](src/mob.ts) - `defineMob` / `MobBuilder`: a **custom mob** compiled to a
  `ConfiguredModule` - a real vanilla mob (AI, damage, death) wearing a helix `Display`
  rig. The two are summoned separately and joined with `ride mount` (so neither value has
  to know about the other), and the module owns the three things riding doesn't give you:
  the rig's yaw (each rig tags itself, then `on vehicle` copies *its own* mob's
  `Rotation[0]` back onto it *and on down to its own passengers*, since every member is
  its own display entity that keeps its own rotation - not the nearest rig, which made two
  mobs standing in each other share a model, and yaw only, since a copied pitch tilts it), hit relay from the model's `interaction`
  hitbox onto the mob, and killing rigs whose mob is gone - a killed vehicle only
  *dismounts* its passengers, so orphans are found by mark-and-sweep (there is no "has a
  vehicle" check; only the vehicle knows its passengers). A rig that rides sits at the
  mount point (`height * 0.75` up), which is what `Display.offset(...)` exists to cancel.
  `toModule` returns the `ConfiguredModule` **plus handles** (`.summon`, `.gestures.x`)
  to the functions it generated, so a consumer never looks a name up on the datapack.
  `.gesture(name, {...})` is the member-animation primitive: vanilla has no per-mob
  animation state, so a gesture snaps the named members to a rotation about a pivot
  (`helix` `displayPose` + `rotateAboutPivot`) and lets the display's own interpolation
  carry them back to the model's rest pose - rest comes from `model.members()`, so a
  pose can't drift from what was summoned. Cooldown is a score on `<name>.gest`; the
  trigger is the author's `Detector` (vanilla has no attack event - the nearest thing,
  a nearby player's `HurtTime` hitting 10, never fires in creative).
- [src/item-registry.ts](src/item-registry.ts) - `registerItem(name, item)` /
  `registerItemGiveCommands(dp)`: dev-only `debug/give/<name>` functions for plain
  (non-behavioural) `ItemValue`s a pack declares.
- [src/env.ts](src/env.ts) - the build's **one** resolved `BuildEnv`. `currentEnv()`
  reads `TWINE_ENV`, `DatapackFactory.create` publishes what it actually pruned by
  (`setBuildEnv`), and module bodies gate emission on `isDev()` - so "which modules
  survive" and "which commands they emit" can never disagree. Never re-read
  `process.env.TWINE_ENV` in a pack; call `isDev()`.
- [src/index.ts](src/index.ts) - the public barrel.

## The module lifecycle (the contract authors implement)

A `DatapackModule` may implement any of:

- `register(dp, scope)` - one-off build-time setup (objectives, standalone functions,
  structures). `scope` is the module's own `{ name, dimension, fn }` (`ModuleScope`):
  `scope.fn(name, body)` creates a function whose body is wrapped in the module's
  dimension, which is what anything called from *outside* the tick tree (admin
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
methods?)` clears latches - nothing re-arms itself. Latches are scoreboard values, so
they **survive a `/reload` and a server restart**: a pack's `reset`/`restart` should call
the generated `<name>/rearm` (emitted for every module with latched handlers, clearing
all of them), or a stale latch silently suppresses its trigger forever.

A module composes `HandlerGroup`s by holding them - discovered by type, from a
field or from an **array** field. Prefer one `groups = [new A(...), new B(...)]` field
when firing order matters: per-field discovery follows *declaration* order, not the
order the constructor assigns, which is not visible where the groups are built.

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
