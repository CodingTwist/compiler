# CLAUDE.md - compiler

Orientation for the whole repo. This is a multi-package workspace for a TypeScript
**Minecraft-datapack compiler** and the layers built on it. Start here, then read the
`CLAUDE.md` inside whichever package you're working in - each one has its own.

## The five packages

They are siblings under `/home/sam/compiler`. They form a layered stack: each builds
**only on the public API of the one below**, and the split is deliberate - the core stays
un-opinionated, the opinions live in the upper layers.

| Package | Layer | One line |
| --- | --- | --- |
| [`helix`](helix/CLAUDE.md) | core compiler | AST → IR → `.mcfunction` + tag JSON, version-profile aware. **Mechanism, never policy.** |
| [`spool`](spool/CLAUDE.md) | conveniences | Opt-in `KitPlugin`s composed from helix's public API. Nothing on by default. |
| [`twine`](twine/CLAUDE.md) | framework | The opinionated layer: NestJS-style module / area / lifecycle composition of a whole pack. |
| [`lab`](lab/CLAUDE.md) | consumer | Sandbox of concrete features on twine + spool. Builds a playable pack. |
| [`unravel`](unravel/CLAUDE.md) | consumer | Plain-helix worked example (`TSTrivia`), no twine/spool. Pinned to an older version profile. |

The governing stance: **helix is un-opinionated, twine is opinionated, spool is the opt-in
middle.** If something feels like a *shortcut* or a *best practice* rather than a
primitive, it does not belong in helix - push it up to spool or twine. See
[helix/PHILOSOPHY.md](helix/PHILOSOPHY.md) for the why.

## How they link (read this before debugging stale types)

`spool`, `twine`, `lab`, `unravel` all depend on helix (and each other) via
`file:../<pkg>` - they consume the **built `dist/`**, symlinked into `node_modules`, not
the source. So:

- After changing a package's source, **`npm run build` it** before any consumer sees the
  new types/behaviour. A stale `dist/` silently hides breaking changes.
- Build downward-up: helix first, then spool/twine, then lab/unravel.

## Conventions shared across every package

- **Typed concepts, not strings.** Build domain values with their typed classes
  (`Selector`, `Pos`, `Block`, `Item`, `Nbt`, `Id`, `Score`) and let them render
  version-aware - never string-interpolate command fragments. If the typed API can't yet
  express a concept, **add it to the API first**, then compose. The only sanctioned raw
  JSON is data resources via `dp.registryFile(...)`.
- **Tests are colocated `*.test.ts`** (vitest), excluded from the `tsc` build.
- Don't commit unless asked.

## Where to go next

Each package's `CLAUDE.md` covers how to work inside it. helix's also holds the deep
compiler internals (the command-handler architecture, the import-cycle constraint, the
generator landmines, the version-data pipeline).

## Docs site

`docs/` is a VitePress site (guide + curated examples + a TypeDoc-generated API
reference for helix/spool/twine). It's a separate sibling, not part of the layered
stack - see [docs/index.md](docs/index.md) for the pitch. To run it locally:

```sh
cd docs && npm install
npm run gen:api   # regenerates docs/api/* from current source (build helix first)
npm run dev
```

### Live playground (`/playground`)

An in-browser page where visitors edit helix code and see the compiled datapack
update live - the real compiler running client-side, no server. It relies on
helix's **`helix/browser`** entry (the disk-free public API; see
[helix/CLAUDE.md](helix/CLAUDE.md)) so **helix must be built first**
(`npm --prefix helix run build`) before the docs build. `npm run gen:playground`
(run automatically by `dev`/`build`) copies two assets, both derived from helix's
`dist/`, into git-ignored `docs/public/`: the version-data JSON (fetched at runtime
and turned into a profile via `profileFromRaw`, since the browser can't read them
from disk) and `helix-types.json` (all of helix's `.d.ts`, fed to Monaco for
autocomplete). The pieces:

- `.vitepress/playground/run.ts` - transpiles the user's TS with `esbuild-wasm`,
  injects `helix/browser`'s exports as function args, runs it, returns
  `buildDatapack`'s files (the same "inject + require a top-level `dp`" contract as
  the build-time `compile-helix.mjs` plugin).
- `.vitepress/theme/Playground.vue` + `monaco-setup.ts` - Monaco editor + output
  panes. **Client-only** (Monaco/esbuild-wasm never run in SSR - dynamic-imported
  from `onMounted`, and used behind `<ClientOnly>` on the page).
- `config.ts` aliases the Node built-ins (`fs`/`path`/`zlib`) to an empty stub:
  helix's pure path never imports them, but its dynamic-imported disk-writer chunk
  references them - the stub satisfies the bundler for that never-run code.
