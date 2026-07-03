# Architecture

## The governing stance

**helix is un-opinionated, twine is opinionated, spool is the opt-in middle.** If
something feels like a *shortcut* or a *best practice* rather than a primitive, it does
not belong in helix - it gets pushed up to spool or twine instead.

Concretely:

- `helix` provides **mechanism**: typed values, commands, and codegen for a given
  Minecraft version. It ships no bundled gameplay patterns and no opinions about how a
  pack is composed. When a feature feels like a shortcut, it doesn't go here.
- `spool` is the **convenience layer**: composed helpers built only on helix's public
  API, delivered as opt-in `KitPlugin`s. Nothing is on by default - you install exactly
  the plugins you want.
- `twine` is the **opinionated framework**: a NestJS-style module/area/lifecycle system
  that dictates how a whole pack is composed - which features are enabled, how they
  nest, and when their behaviour runs. Where helix refuses to dictate structure, twine
  *is* the structure.

## How the layers link

The packages consume each other's **built `dist/`** via `file:../<pkg>` links in
`package.json` (symlinked into `node_modules`), not source directly. This means:

- After changing a package's source, you must rebuild it (`npm run build`) before any
  consumer sees the new types or behaviour. A stale `dist/` silently hides breaking
  changes.
- Build **downward-up**: helix first, then spool and twine.

## Compilation model (helix)

A pack is authored as fluent TypeScript against a `Datapack` instance pinned to a
specific `VersionProfile`. Authoring builds an AST; codegen lowers that AST to an IR and
renders it to `.mcfunction` text and tag/resource JSON - version-aware, so the same
source can emit correct, different output across Minecraft versions (folder names, pack
format, command grammar, registry membership).

Two output forms exist side-by-side:

- `dp.writeDatapack(path)` - writes the `data/` tree to disk.
- `buildDatapack(dp)` - the same codegen, in memory, returning a `path → contents` map.
  This is what `dp.report()` (cost analysis) and `validateDatapack()` (mcdoc JSON
  validation) both build on, and it's the seam a future browser-based live preview would
  use.

## Typed concepts, not strings

Every layer shares one rule: build domain values with their typed classes - `Selector`,
`Pos`, `Block`, `Item`, `Nbt`, `Id`, `Score` - and let them render version-aware. Command
handlers never string-interpolate fragments like `@a[distance=..6]` or `{Health:20f}`. If
the typed API can't yet express a concept, that's a signal to extend the API, not to drop
to a raw string.

## Where to go deeper

- [Helix](/guide/helix) - the compiler core: AST/IR, command architecture, version
  profiles, cost reporting, JSON validation.
- [Spool](/guide/spool) - the `KitPlugin` system and the plugin catalog.
- [Twine](/guide/twine) - module/area/lifecycle composition, items, state machines.
