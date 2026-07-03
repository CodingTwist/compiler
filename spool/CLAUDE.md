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
- You turn it on with `installKit([...])` (or `createKit().use(...).install()`).
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
- [src/kit.ts](src/kit.ts) - the installer: `installKit([...])` / `createKit()`.
- [src/index.ts](src/index.ts) - the barrel. Exports the contract + each plugin's result
  **type** (e.g. `PlayerMotion`). Importing it turns on **nothing** - type-only by design.
- [src/plugins/](src/plugins/) - **one directory per plugin**, each a self-contained
  `plugins/<name>/` folder whose `index.ts` is the plugin entry (the `KitPlugin` + its
  `declare module` augmentation). Current: `holding`, `clip`, `entity_set`, `native`,
  `player_motion`. A plugin's whole implementation - engine code, concern files, its own
  `*.test.ts` - lives inside its folder and nowhere else, so the folder is the unit you
  read, move, or delete. [src/plugins/all.ts](src/plugins/all.ts) is the only flat file;
  it bundles every plugin for `installKit(allPlugins)`.

## Using it

```ts
import { installKit } from "spool";
import { holding } from "spool/plugins/holding";

installKit([holding]);          // now dp/Selector have the holding helpers
```

Consumers import from a plugin's **subpath** - `spool/plugins/<name>` resolves to
`plugins/<name>/index.ts` via the `./plugins/*` → `dist/plugins/*/index.js` mapping in
[package.json](package.json). The folder is invisible from the outside: the import path is
just the plugin name.

**Adding a plugin:** create `src/plugins/<name>/index.ts`, export a `KitPlugin`, list it
in `plugins/all.ts`, and if it returns a handle, export that handle's **type** from
`src/index.ts`. Build only on helix's public API.

**A multi-file plugin** keeps every extra file inside its own folder. `player_motion` is
the reference (and mirrors the `lab` timebubble module style): `index.ts` is the thin
entry (public type + `KitPlugin` + orchestration), `context.ts` holds the shared state
every helper reads, then one file per concern (`resources.ts`, `init.ts`, `store.ts`,
`launch.ts`, `math.ts`, `api.ts`). `clip` is the same shape - `index.ts` installs the
plugin and the rest of the folder is its private animation engine. Consumers still import
only the `<name>` subpath; the split is internal.

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
