# compiler

A TypeScript compiler for Minecraft datapacks, and the layers built on top of it. Write
your pack in TypeScript - typed selectors, scores, items, blocks, NBT and commands - and
compile it straight to `.mcfunction` and JSON, version-profile aware.

```ts
import { Datapack, v26_2, Selector, Item } from "helix";

const dp = new Datapack("welcome", v26_2);

dp.createFunction("greet").build((ctx) => {
  const players = Selector.allPlayers();
  ctx.tellraw(players, "Welcome to the server!");
  ctx.playerGive(players, Item.DIAMOND, 3);
});

dp.writeDatapack("./out");
```

Full guide, curated examples and API reference: see [`docs/`](docs/index.md).

## Packages

Three sibling packages under this repo, forming a layered stack - each builds **only on
the public API of the one below**:

| Package | Layer | One line |
| --- | --- | --- |
| [`helix`](helix/CLAUDE.md) | core compiler | AST → IR → `.mcfunction` + tag JSON, version-profile aware. **Mechanism, never policy.** |
| [`spool`](spool/CLAUDE.md) | conveniences | Opt-in `KitPlugin`s composed from helix's public API. Nothing on by default. |
| [`twine`](twine/CLAUDE.md) | framework | The opinionated layer: NestJS-style module / area / lifecycle composition of a whole pack. |

The governing stance: **helix is un-opinionated, twine is opinionated, spool is the
opt-in middle.** If something feels like a *shortcut* or a *best practice* rather than a
primitive, it belongs in spool or twine, not helix. See
[helix/PHILOSOPHY.md](helix/PHILOSOPHY.md) for the why.

## Getting started

Each package depends on the ones below it via `file:../<pkg>`, consuming the **built
`dist/`** - not the source. Build downward-up:

```sh
npm --prefix helix install && npm --prefix helix run build
npm --prefix spool install && npm --prefix spool run build
npm --prefix twine install && npm --prefix twine run build
```

After changing a package's source, rebuild it before consumers see the new
types/behaviour - a stale `dist/` silently hides breaking changes.

See each package's own `CLAUDE.md` for its commands, architecture and landmines:
[helix](helix/CLAUDE.md), [spool](spool/CLAUDE.md), [twine](twine/CLAUDE.md).

## Docs site

`docs/` is a VitePress site - guide, curated examples, a TypeDoc API reference, and a
live in-browser playground.

```sh
cd docs && npm install
npm run gen:api   # regenerates docs/api/* from current source (build helix first)
npm run dev
```
