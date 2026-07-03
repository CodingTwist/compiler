# Spool - conveniences

`spool` is the **convenience layer**: handy, composed helpers built on top of helix's
public API. It's the opt-in middle ground between the bare compiler (`helix`) and the
opinionated framework (`twine`). Nothing here is on by default - you pull in only the
pieces you want.

The one rule: build **only on helix's public API**. No deep `helix/dist/core/...`
imports, no reaching into the IR. If a plugin needs a primitive that isn't public, that
primitive gets added to helix first.

## How a plugin works

Every feature is a **`KitPlugin`** - `{ name, deps?, install() }`:

- A plugin is **inert** until turned on. Importing it does nothing at runtime.
- You turn it on with `installKit([...])`.
- `install()` adds the plugin's method to a shared helix prototype (e.g.
  `Datapack.prototype.playerMotion`), and runs **once, ever** - the kit guarantees that,
  deduping by `name` and ordering by `deps`, so plugins never fight over one method.

```ts
import { installKit } from "spool";
import { holding } from "spool/plugins/holding";

installKit([holding]); // now dp / Selector have the holding helpers
```

Each plugin is reachable via its own subpath, `spool/plugins/<name>` - the import path
is just the plugin's name; its internal file layout is invisible from the outside.

## Plugin catalog

- **`holding`** - held-item detection helpers.
- **`entity_set`** - `dp.entitySet(name)` returns an `EntitySet`, a tagged `@e[tag=…]`
  set so you avoid re-scanning every entity.
- **`clip`** - a cutscene/animation engine (`Clip`, `Cutscene`, keyframed transform and
  NBT tracks, teleport tracks).
- **`native`** - the `ctx.native()` escape hatch for calling out to Paper plugin
  behaviour, with a vanilla fallback path (`Datapack.target`).
- **`player_motion`** - a full player-motion/physics port (impulses, velocity
  application), no macros, modern-API only.
- **`raycast`** - a raycasting primitive shared by motion-based plugins.
- **`grapple`** - a swing/grapple mechanic built on `player_motion`'s sustained-impulse
  primitive.

## Full API reference

See the generated [spool API reference](/api/spool/) for the `KitPlugin` contract, the
installer, and every plugin's exported types.
