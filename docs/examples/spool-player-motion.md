# Spool plugin: player motion

`player_motion` is one of spool's more fully-realized plugins: a typed port of the
published `player_motion` datapack, launching a player by decomposing a velocity vector
into a 32-bit-per-axis score tree that an `apply_impulse` enchantment reads. It's a good
example of the `KitPlugin` shape because its whole public surface is two small typed
methods.

## Installing the plugin

A plugin does nothing until it's installed. `installKit` adds its method to the shared
`Datapack` prototype, once, ever:

```ts
import { Datapack, Selector, v26_2 } from "helix";
import { installKit } from "spool";
import { playerMotion } from "spool/plugins/player_motion";

installKit([playerMotion]);

const dp = new Datapack("mypack", v26_2);
const pm = dp.playerMotion();
```

## Launching with a typed velocity

`launchLocal` takes a velocity **relative to the player's facing** - sideways/up/forward
in blocks/tick - and must run positioned as the player:

```ts
dp.createFunction("launch/jump_pad").build((ctx) => {
  ctx
    .execute()
    .as(Selector.allPlayers())
    .at(Selector.self())
    .run((c) => pm.launchLocal(c, { up: 1.4, forward: 0.6 }));
});
```

`launchGlobal` is the same idea along world axes instead of facing-relative ones. Both
have sustained per-tick counterparts - `applyLocal` / `applyGlobal` - for continuous
motion (a thrust, a grapple arc) once a launch is already underway; the `grapple` plugin
is built on exactly that primitive.

No macros, no hand-built NBT: the whole 96-effect enchantment (32 bits × 3 axes) and its
predicates are generated resource JSON, driven entirely by the typed `LocalVelocity`/
`GlobalVelocity` interfaces.

See the [spool guide](/guide/spool) for the plugin system in general, and the generated
[`PlayerMotion` API reference](/api/spool/interfaces/PlayerMotion) for the full method
set.
