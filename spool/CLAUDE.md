# CLAUDE.md - spool

Working notes for **spool**. See the root [helix/CLAUDE.md](../helix/CLAUDE.md) for the
compiler core and the package layout.

## What this is

`spool` is the **convenience layer**: handy, composed helpers built on top of helix's
public API. It's the opt-in middle ground between the bare compiler (`helix`) and the
opinionated framework (`twine`). Nothing here is on by default - you pull in only the
pieces you want.

## The one rule

Build **only on helix's public API**. No `helix/dist/core/...` deep imports, no
`new XxxNode`, no IR poking. If you need a primitive that isn't public, add it to helix
first, then compose it here.

## How a plugin works

Every feature is a **`KitPlugin`** - `{ name, deps?, install() }` (see
[src/plugin.ts](src/plugin.ts)):

- A plugin is **inert** until you turn it on. Importing it does nothing at runtime.
- You turn it on with `installKit([...])`.
- `install()` adds the plugin's method to a shared helix prototype (e.g.
  `Datapack.prototype.playerMotion`). It runs **once, ever** - the kit guarantees that.

### Do plugins interfere?

No. Each plugin adds its **own** method under its **own** name, and the kit in
[src/kit.ts](src/kit.ts) dedupes by `name` and orders by `deps`, so the same plugin can
never install twice and two plugins can't fight over one method. The only shared surface
is the helix prototype, and each plugin only ever writes its own slot on it.

> Naming note: nothing here is called "the registry." The `entity_set` plugin gives you
> `dp.entitySet(name)` → `EntitySet` (a tagged `@e[tag=…]` set so you avoid scanning every
> entity), and [src/kit.ts](src/kit.ts) is the **installer**. The word "registry" is
> reserved for helix's `dp.registryFile(...)` (raw registry-resource JSON) - keep them
> distinct.

## Layout

- [src/plugin.ts](src/plugin.ts) - the `KitPlugin` shape.
- [src/kit.ts](src/kit.ts) - the installer: `installKit([...])`.
- [src/index.ts](src/index.ts) - the barrel. Exports the contract + each plugin's result
  **type** (e.g. `PlayerMotion`). Importing it turns on **nothing** - type-only by design.
- [src/plugins/](src/plugins/) - **one directory per plugin**, each a self-contained
  `plugins/<name>/` folder whose `index.ts` is the plugin entry (the `KitPlugin` + its
  `declare module` augmentation). Current: `holding`, `clip`, `entity_set`, `native`,
  `player_motion` and more. Plugins that are per-use values rather than methods (`locator`,
  `rig`, `mob`, `difficulty`) skip the `KitPlugin` and export plain functions. A plugin's
  whole implementation - engine code, concern files, its own `*.test.ts` - lives inside its folder and nowhere else, so the folder is the unit you
  read, move, or delete. There are **no flat files** under `plugins/` - a loose file
  would not resolve through the `./plugins/*` → `*/index.js` subpath mapping.

## Using it

```ts
import { installKit } from "spool";
import { holding } from "spool/plugins/holding";

installKit([holding]); // now dp/Selector have the holding helpers
```

Consumers import from a plugin's **subpath** - `spool/plugins/<name>` resolves to
`plugins/<name>/index.ts` via the `./plugins/*` → `dist/plugins/*/index.js` mapping in
[package.json](package.json). The folder is invisible from the outside: the import path is
just the plugin name.

**Adding a plugin:** create `src/plugins/<name>/index.ts`, export a `KitPlugin`, and if it
returns a handle, export that handle's **type** from `src/index.ts`. There is no central
registry to update - the subpath mapping picks the folder up on its own. Build only on
helix's public API.

**A multi-file plugin** keeps every extra file inside its own folder. `player_motion` is
the reference (and mirrors the `lab` timebubble module style): `index.ts` is the thin
entry (public type + `KitPlugin` + orchestration), `context.ts` holds the shared state
every helper reads, then one file per concern (`resources.ts`, `init.ts`, `store.ts`,
`launch.ts`, `math.ts`, `api.ts`). `clip` is the same shape - `index.ts` installs the
plugin and the rest of the folder is its private animation engine. Consumers still import
only the `<name>` subpath; the split is internal.

### Custom mobs: `rig`, `mob`, `difficulty`

A real vanilla mob (AI, damage, death) wearing a helix `Display` rig, summoned separately and
joined with `ride mount`. `plugins/rig` owns what riding doesn't give you, and works for any
vehicle, not just mobs:

- **Yaw:** every rig member keeps its own rotation, so each is turned from _its own_ mob, yaw
  only (a copied pitch tilts the model). 1.21.2+ uses `rotate`; older versions copy
  `Rotation[0]` through NBT.
- **Hit relay:** hits on the model's `interaction` hitbox become damage on the mob, tested with
  `if function <name>/attacked` (`on attacker`), not an NBT read.
- **Orphans:** a killed vehicle only _dismounts_ its passengers and nothing can test "has a
  vehicle", so rigs are found by mark-and-sweep (`markOrphans`, `claim` as each live
  vehicle, `sweep`), which the mob runs in `wake`.
- A riding rig sits at the mount point (`height * 0.75` up); `Display.offset(...)` cancels it.

`plugins/mob` builds on the rig: `defineMob(nbt, model)...build(name)` returns a `Mob` (`emit/`
holds one file per emitted job). The caller runs `mob.register(dp, fn?)`, `mob.wake` once a second
and `mob.tick(ctx)` every `tickEvery`; twine's `toModule` does all three.

**Idle cost is a score check.** `<name>/wake` runs once a second: it tags mobs within
`wakeRange` (default 48) of a player `<name>.awake`, keeps mid-gesture or mid-state mobs awake
as `<name>.finishing` (they finish, but no `when` fires), stores the count in `#awake`, and
sweeps orphans. The per-tick poll is one `if score #awake` into `<name>/tick_one`, where
everything is written against `@s`: the author's `.onTick`, the state dispatch, each gesture's
fall and `<gesture>_clock`, the triggers, the yaw copy, and the hit relay.

**Every check is written once, by the plugin.** A rule for mob codegen, and for authors:

- **wake:** one `as <mobs>` scan into `wake_one`, then one `at @a as <mobs>[distance]` scan into
  `wake_near`.
- **triggers:** all gesture triggers sit behind one `unless finishing` check (`<name>/triggers`).
- **animation steps:** a sequence's steps are one `dispatchScore` on the clock (`<g>_pose` →
  `<g>_step_<k>`), with no per-member `as @s[scores=…]`.
- **states:** a multi-phase mob uses `.states({ name: { polls?, onEnter?, tick?, onDone?, then? } })`,
  never hand-rolled tags that each line re-checks. The index lives in `<name>.state` and
  `tick_one` checks it once; `<name>/state` dispatches on a `#<name>_state` copy so entering a
  later state can't also run it this poll; a timed state counts `<name>.state_t` down
  (`mob.clock`). Every body gets `mob.enter/leave`; state names are typed when `.states()` is
  declared first.

**Gestures** (`.gesture(name, {...})`) snap members to a rotation about a pivot and let the
display's interpolation carry them back to rest, which comes from `model.members()` so a pose
can't drift from what was summoned. An array `rotate` is a sequence stepped off the mob's own
`<mob>.<gesture>` cooldown (so each mob animates independently). `tilt` turns orientation only.
`onFire` is the author's hit (vanilla has no contact event); the trigger is the author's
`Detector`. One cooldown **per gesture**, so an idle gesture can't gate the others.
`resolveGesture` fills defaults and rejects timings that don't fit inside the cooldown.

**Difficulty** (`plugins/difficulty`) is a pack-owned level, not vanilla's: `#level twine.difficulty`
(1/2/3; the objective keeps its twine name so worlds keep their level). `difficulty(dp)` seeds it
from `/difficulty` on load only while unset (twine's `mount` calls it); after that
only the pack changes it (`setDifficulty("hard")`, or a raw scoreboard set). Nothing is applied
by itself - scaling is author code reading an author config (`defineDifficulty`, every
level required). The mechanism: `mob.byDifficulty(ctx, (c, level) => ...)` builds a body once
per level behind a dispatch on the score (its own function, since the dispatch `return`s);
`.onDifficulty((ctx, dp, level) => ...)` becomes `<name>/zzz/on_difficulty`, run at summon and,
when `wake` sees `#level` differ from `#applied`, on every live mob. Gesture switches are the
author's own `when` clause on `DIFFICULTY`.

A `Mob` exposes **handles** (`.summon`, `.spawn`, `.wake`, `.gestures.x`, `.states.x`,
`.onTickFn`), so a consumer never looks a function name up. The plugin
`dp.allowNbtRead`s `face_one` and cooldown-capped gesture bodies so the report doesn't warn.

## Commands

- `npm run build` - `tsc` (consumers read the built `dist/`). Rebuild before `lab` sees a
  change.
- `npm test` / `npx vitest run` - colocated `*.test.ts`. Pattern: `new Datapack(...)`,
  `installKit([plugin])`, call the method, assert on `dp.files` / `dp.registryFileDefs` /
  `dp.tags`.

## Convention

**Typed concepts, not strings** (inherited from helix): build values with
`Selector`/`Pos`/`Item`/`Nbt`/`Id`/`Score`. The one exception is raw JSON for data
resources via `dp.registryFile(...)` (e.g. the `player_motion` enchantment table, built
by a TS loop - exactly where the compiler earns its keep).
