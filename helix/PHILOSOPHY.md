# Design philosophy

The governing principles for this compiler. `CLAUDE.md` documents *how the code is
wired*; this file documents *what we are trying to be* and the rules that protect it.
When a change conflicts with one of these principles, the change is wrong - fix the
change, not the principle. If a principle genuinely needs to bend, edit this file in the
same PR and say why.

## The one idea: source is concepts, not strings

The whole point of compiling a datapack from TypeScript - rather than just writing
`.mcfunction` files by hand - is that the compiler can *understand* what you wrote and
emit correct, version-specific output from it. That only works if the author programs
with **typed domain concepts**, not with strings.

This is already the rationale behind the value layer
([src/core/values/value.ts](src/core/values/value.ts)):

> A domain concept ... renders to a single command token ... Rendering is deferred to
> codegen and given the target version, so a concept can encode itself differently per
> version (e.g. item data components vs NBT) - **the author programs with the concept,
> not the string.**

A `Selector` object knows it is a selector. The compiler can validate it, render it
differently for different versions, and refactor it. A `string` like
`"@e[tag=cog_0,limit=1]"` is an opaque blob: the compiler cannot check it, cannot
re-target it for another version, and cannot tell it apart from any other text. **Every
string accepted where a concept belongs forfeits the entire reason this compiler
exists.** That is the failure mode the rest of this document defends against.

## Principle 1 - Typed objects, not strings (hard rule)

Every author-facing argument that *denotes a domain concept* MUST be the typed object
for that concept. Never a bare `string`, and never a `Concept | string` union.

Concepts in scope: selectors, resource locations, NBT, NBT paths, positions, blocks,
items, score targets, objectives, tag names, enchantment ids - and any future concept
of the same shape.

**Reuse the existing value/builder types; do not invent parallel ones:**

| Concept | Type | Location |
| --- | --- | --- |
| Selector | `Selector` | [src/core/frontend/nodes/selector.ts](src/core/frontend/nodes/selector.ts) |
| Resource location (generic) | `Id` / `IdValue` | [src/core/values/id.ts](src/core/values/id.ts) |
| Registry entry (biome, enchantment, …) | `Biome`, `Enchantment`, … - branded `ResourceId<R>` | [src/core/values/resource.ts](src/core/values/resource.ts) + generated [resource.generated.ts](src/core/values/resource.generated.ts) |
| NBT + NBT path | `Nbt` / `NbtPath` | [src/core/values/nbt.ts](src/core/values/nbt.ts) |
| Position | `Pos` | [src/core/values/pos.ts](src/core/values/pos.ts) |
| Block | `Block` | [src/core/values/block.ts](src/core/values/block.ts) |
| Item | `Item` | [src/core/values/item.ts](src/core/values/item.ts) |

**Don't flatten distinct concepts to a generic type either.** A `biome` argument is
`Biome`, not `Id`; an `enchantment` is `Enchantment`. The Brigadier tree records the
registry each resource arg targets (`properties.registry`), so the generator mints one
branded `ResourceId<R>` per registry - a generic `Id` on a registry-specific slot is the
same cop-out as a `string`, just one level up.

**The `| string` escape hatch is the anti-pattern, not a feature.**
[`ArgInput`](src/core/values/value.ts) is currently
`CommandValue | string | number | boolean`; the `string` arm exists for convenience and
it is exactly what this principle is fighting. It must **shrink over time, never grow**.
The target end-state is an `ArgInput` with no concept-replacing `string` arm.

**Missing a type is not a license to accept a string.** Where no concept type exists yet
(`ScoreTarget`, `TagName`, `EnchantmentId` today), the rule is *create the type*, then
use it - not fall back to `string`.

## Principle 2 - Layer separation: Frontend and IR must not touch

The pipeline is **Frontend → Commands → IR → Codegen**, and dependencies flow one way.

- **Frontend** ([src/core/frontend/](src/core/frontend/)) is the author-facing fluent
  API. It builds nodes; it does not know how they are rendered.
- **IR** ([src/core/ir/](src/core/ir/)) is the shared node vocabulary, the dispatcher,
  and codegen infrastructure. It must **never** import or reach back into the frontend.
- Each command's node + builder + handler co-locate in
  [src/core/commands/`<cmd>`.ts](src/core/commands/).

There are no back-edges from IR into the frontend. Command files must stay
leaf-importable so the frontend can import their nodes without dragging a
`FunctionContext` augmentation through an import cycle. The concrete dependency rules and
the import-cycle constraint that enforce this are in
[CLAUDE.md](CLAUDE.md) ("Import-cycle constraint"); treat them as the mechanical
expression of this principle.

## Principle 3 - The IR is pure: it builds the AST, nothing else

Constructing IR nodes produces **data only**. No I/O, no global mutation, no version
branching at construction time. Building the same source twice builds the same tree.

- Version data reaches handlers **only** at codegen, through `ctx.datapack.version`.
  Handlers are **stateless singletons** - never pass a version into a handler
  constructor, never rebuild the handler map per version (see "Core invariant" in
  [CLAUDE.md](CLAUDE.md)).
- `CommandValue.render(version)` is the **single** place a concept turns into a string,
  and it must stay a pure function of `(value, version)`.
- Corollary: no validation and no string emission at authoring time. Both are deferred
  to codegen, where the target version is known.

This is *why* Principle 1 matters: a concept can only render itself correctly per version
if it reached codegen as a concept. A string baked in at authoring time has already
thrown that away.

## Audit - current violations of Principle 1

These are known string-typed APIs that break Principle 1. They are recorded here as a
cleanup backlog; fix them in later passes and tick them off. **Do not add new entries to
this list - new code must comply.**

- [x] [src/core/display/frames.ts:49](src/core/display/frames.ts#L49) - was a selector
      built by string interpolation; now uses the `Selector` builder.
- [x] [src/core/commands/data.ts:15-24](src/core/commands/data.ts#L15-L24) - `DataArgs`
      `| string` arms removed; concept-only.
- [x] All generated command builders (`teleport`, …) - the `| string` / `| number`
      escape-hatch arms were removed at the source in
      [scripts/gen-commands.mjs](scripts/gen-commands.mjs) (the `PARSERS` map) and the
      78 files regenerated. Hand-refined `setblock` tightened to match.
- [x] Display-layer callers of the tightened builders (`src/core/display/{clip,slide,effect}.ts`,
      `src/core/values/display.ts`) updated to pass objects: selectors via the
      `Selector` builder, function ids via `FunctionId`, structure ids via `Id`,
      entity types via `EntityType`, schedule delays via `Time`. The legacy
      `Pos | string` author inputs are coerced at the boundary with `Pos.raw(...)`
      ([src/core/values/pos.ts](src/core/values/pos.ts)) rather than leaking strings
      into the strict command API.
- [x] [src/core/frontend/data.ts](src/core/frontend/data.ts) - the `ctx.data()` /
      `storage`/`entity`/`block` sugar (the frontend twin of `commands/data.ts`) had
      `| string` on every verb (`NbtPath | string`, `Selector | string`, `Pos | string`,
      `Id | string`, `Nbt | string`); all tightened to the concept type.
- [x] `atEntity` (now a clause on [src/core/commands/execute.ts](src/core/commands/execute.ts)) and
      [src/core/commands/near_guard.ts](src/core/commands/near_guard.ts) - the
      `atEntity`/`whenPlayerNear` sugar took raw selector/position strings; now
      `Selector` and `Pos`. (Handlers render via `toCommandValue(x).render(version)`.)
- [x] [src/core/values/paths.ts](src/core/values/paths.ts) - the `Path.*` curated NBT-path
      constants were bare strings; each is now a real `NbtPath`, so they drop straight
      into the typed `data` API (free-form paths use `NbtPath("...")`).
- [ ] [src/core/commands/tag.ts:14](src/core/commands/tag.ts#L14),
      [:24](src/core/commands/tag.ts#L24) - tag name is a bare `string`; introduce a
      `TagName` type. **Blocked on the generator:** `tag.ts` is regenerated from the
      Brigadier tree, where the name arg is an undistinguished `brigadier:string`, so
      the fix belongs in `scripts/gen-commands.mjs` (a per-command arg-type override
      mapping that slot to `TagName`), not the generated file.
- [x] [src/core/frontend/nodes/score.ts](src/core/frontend/nodes/score.ts) -
      `Score.target` (and `Objective.score`) was a `string`; now a
      [`ScoreTarget`](src/core/values/score_target.ts) (selector or fake-player name).
      The IR score nodes (`score_set/add/remove`, `score_range`/`score_compare`,
      `store_score`, `score_set_score`) carry `ScoreTarget` through to codegen and
      render via `toCommandValue(x).render(version)`.
- [x] [src/core/commands/give.ts](src/core/commands/give.ts) - `playerGive`'s
      `item: ItemSpec | string` is now `ItemSpec | Item`; `ItemSpec.id` is an `Item`
      and `enchantments` keys on the branded `Enchantment` resource type (reusing the
      existing registry type rather than minting a parallel `EnchantmentId`). Item id
      and enchantment ids render at codegen.
- [ ] [src/core/values/value.ts:17](src/core/values/value.ts#L17) - `ArgInput`'s
      `string` arm, the root escape hatch. Removing this is the end-state that closes
      out the rest of the list.
