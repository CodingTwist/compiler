# scripts

## Version data (not vendored)

Minecraft version data - the registry id lists and the Brigadier command tree -
is **not committed** to this repo. It's Mojang-derived game data (via
[misode/mcmeta](https://github.com/misode/mcmeta)), so it's fetched at build time
instead of being checked in or shipped.

- `scripts/supported-versions.json` - the list of supported version ids
  (committed; this is our config, not game data).
- `src/versions/<id>.ts` - a 2-line module exporting `v<id>` (committed).
- `src/versions/data/<id>.json` - the raw mcmeta data, **gitignored**. Fetched
  on demand, parsed at load time by `src/versions/load.ts`.

## versions.mjs

**Requires network access.**

```sh
node scripts/versions.mjs sync          # fetch any missing supported data
node scripts/versions.mjs sync --force  # re-fetch everything (refresh)
node scripts/versions.mjs add <id>      # add a new supported version
```

`sync` runs automatically before `npm run build` and `npm test`. It **skips
versions whose data is already present**, so once fetched, normal builds need no
network. A fresh clone fetches everything on the first build.

`add <id>` fetches the data, writes `src/versions/<id>.ts`, and appends the id to
`supported-versions.json`. Then add the printed `export { v<id> } from "./<id>";`
line to `src/versions/index.ts`. (The `1.` prefix was dropped in newer releases -
use ids like `26.2`.)

`load.ts` turns the raw data into a `VersionProfile`, deriving:

- **registries** (`items`, `blocks`, `effects`, `particles`, `sounds`,
  `entityTypes`, `enchantments`) from the mcmeta registry report.
- **paths** - singular `function` / `tags/function` for data version ≥ 3953
  (1.21), plural otherwise.
- **pack** - scalar `pack_format` below pack format 80, min/max range at/above.

> The build (`... && tsc && node scripts/copy-data.mjs`) copies the fetched
> `src/versions/data/*.json` into `dist`, since `tsc` does not copy non-`.ts`
> assets.

## gen-commands.mjs

Generates one fluent command file per Minecraft command from a version's
Brigadier command tree.

```sh
npm run gen:commands                 # use the newest fetched data
node scripts/gen-commands.mjs 26_2.json   # use a specific data file
```

It writes `src/core/commands/<cmd>.ts` (one file per command) plus the barrel
`src/core/commands/index.ts`. Each command file is self-contained:

- `<Cmd>Node` - a typed AST node (`type = "<cmd>"`) carrying `CommandPart[]`.
- `<Cmd>Builder` - a fluent builder, one method per literal sub-command branch
  (e.g. `weather().clear(100)`, `effect().give(target, "speed", 30, 2)`), each
  mutating the node by reference. Commands whose first segment is an argument
  (`gamemode <mode> [target]`) take those args on the entry call directly.
  Builder arguments are typed by their **Brigadier parser** via the `PARSERS`
  map: each parser maps to a domain concept from `src/core/values` (`Pos`,
  `Block`, `Item`, `Id`, `NumRange`, `Time`, ...) or a `Selector`, not a bare
  string. So `setblock(Pos(10,4,5), Block("stone"))` is the API, and segment
  order from the tree is preserved (e.g. a trailing mode literal stays after the
  position/block args).
- `<Cmd>Handler` - a per-command handler (subclass of `TreeCommandHandler`) that
  validates and renders the node's parts against whatever version the datapack
  targets. Per-version correctness comes from the command tree at codegen time;
  the builders are just authoring convenience.
- a `declare module` + `FunctionContext.prototype.<cmd>` augmentation, so the
  public API stays `ctx.<cmd>()`.

These files are **committed source** (so the project compiles and tests run
without re-running the generator). Regenerate after adding/refreshing a version
(it reads the newest fetched data).

The generator overwrites every command file and rewrites the barrel each run, so
don't hand-edit them. Two opt-outs in the script:

- `HAND_WRITTEN_ELSEWHERE` - commands with a bespoke frontend on the context
  chain (`say`, `give`, `tellraw`, `trigger`, `random`, `function`, `execute`,
  `scoreboard`); skipped entirely so the generated entry never shadows them.
- `HAND_REFINED` - commands whose `src/core/commands/<cmd>.ts` is hand-written;
  the file is left untouched but still imported and registered in the barrel.
  Use this to give a heavy command (e.g. a concept-modelled `effect`) a richer
  builder while keeping it wired in.
