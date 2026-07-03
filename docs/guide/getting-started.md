# Getting started

## The three packages

They are siblings under one workspace, forming a layered stack: each builds **only on
the public API of the one below**, and the split is deliberate - the core stays
un-opinionated, the opinions live in the upper layers.

| Package | Layer | One line |
| --- | --- | --- |
| `helix` | core compiler | AST → IR → `.mcfunction` + tag JSON, version-profile aware. **Mechanism, never policy.** |
| `spool` | conveniences | Opt-in `KitPlugin`s composed from helix's public API. Nothing on by default. |
| `twine` | framework | The opinionated layer: NestJS-style module / area / lifecycle composition of a whole pack. |

See [Architecture](/guide/architecture) for why the split exists.

## Install and build order

The packages consume each other's **built** `dist/` via `file:../<pkg>` links, not
source - so after changing a package you must rebuild it before anything downstream
sees the change. Build **downward-up**:

```sh
npm --prefix helix install && npm --prefix helix run build
npm --prefix spool install && npm --prefix spool run build
npm --prefix twine install && npm --prefix twine run build
```

A stale `dist/` silently hides breaking type changes in whatever consumes it - if a
consumer's types look wrong after an edit, rebuild the package you changed first.

## Writing your first pack

The plain-helix path - no `spool`, no `twine` - is the fastest way to see the compiler
work. See the [helix guide](/guide/helix) for the core concepts (typed values, version
profiles, the `Datapack`).

```ts
import { Datapack, Selector, v26_2 } from "helix";

const dp = new Datapack("mypack", v26_2);

const load = dp.createFunction("load");
load.build((ctx) => {
  ctx.say("Hello, world!");
  ctx.tellraw(Selector.allPlayers(), "Welcome!");
});

dp.writeDatapack("./out");
```

Once you're comfortable with helix, `spool` (see [guide](/guide/spool)) adds opt-in
conveniences (holding-item detection, cutscene-style clips, entity sets, player-motion
physics), and `twine` (see [guide](/guide/twine)) adds a whole-pack module/lifecycle
framework for composing many features together.
