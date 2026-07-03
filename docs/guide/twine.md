# Twine - the framework

`twine` is the **opinionated framework layer**: a NestJS-style module/area/lifecycle
system for composing a whole datapack out of features. It sits above `helix` (the
un-opinionated compiler) and `spool` (conveniences) and owns *project composition* -
which features are enabled, how they nest, and when their behaviour runs.

Where helix deliberately refuses to dictate structure, twine **is** the structure: a
feature is a decorated module, modules form a tree, lifecycle runs through fixed hooks,
and area ancestry gates tick cost.

## Modules

A feature is a **module** - a class decorated with `@Module({ name, area?,
activeByDefault?, imports?, env? })`. The app is a tree of modules wired through
`imports`, and `DatapackFactory.create(RootModule, opts)` walks the enabled tree and
emits one `Datapack`. A module **not reachable through `imports` is never constructed
and emits nothing** - that's the compile-time disable.

## The module lifecycle

A module may implement any of:

- `register(dp)` - one-off build-time setup (objectives, standalone functions,
  structures).
- `onLoad(ctx)` - appended to the shared `load` function; always runs.
- `onTick(ctx)` - appended to the shared `tick` function, but only reached while every
  `area` ancestor is active. Put per-tick work here.
- `onActivate(ctx)` / `onDeactivate(ctx)` - edge functions for an `area` module (e.g.
  summon/despawn a level's entities).

An `area: true` module gates its subtree's tick cost behind a presence/region check -
the parent's single `active` check skips the whole subtree for free when dormant.

## One owned tick entry

helix auto-tags every function created with the `tick` tag into vanilla
`minecraft:tick`. twine collapses that to a single owned entry: `consolidateTick(dp)`
(run automatically at the end of `DatapackFactory.create`) untags every other member and
routes the whole pack's per-tick work through one traceable, gateable list.

## Custom items

`defineItem` builds a behavioural item - give/held/attack/use hooks - as an
`ItemBuilder`, on top of helix's typed `Item` values.

## State machines

`StateMachine` is a small typed helper for per-entity/per-player state built on helix
`Objective`s, for features that need explicit states and transitions rather than ad-hoc
scoreboard flags.

## Full API reference

See the generated [twine API reference](/api/twine/) for `Module`, `DatapackFactory`,
`defineItem`, `StateMachine`, and the rest of the public surface.
