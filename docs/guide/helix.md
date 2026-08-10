# Helix - the core compiler

`helix` is a TypeScript compiler for Minecraft datapacks. You author a pack in fluent
TS; it compiles **AST → IR → `.mcfunction` files + tag JSON**, targeting a specific
Minecraft `VersionProfile` so the same source emits correct, different output across
versions (folder names, pack format, command grammar, registry membership).

Its defining stance is that it is **un-opinionated**: it provides mechanism - typed
values, commands, codegen for a version - never policy. Anything that picks a
convention belongs in [spool](/guide/spool) or [twine](/guide/twine) instead.

This page walks the **authoring surface** - the handful of classes you use to write a
pack. Every example below is compiled by the docs build itself: the **Compiled output**
panels are the real files helix emits for the source shown, so they can't drift. For the
full symbol list see the [API reference](/api/) (which leads with this same authoring
surface, grouped by task).

## The `Datapack`

Everything hangs off a [`Datapack`](/api/helix/classes/Datapack) instance, constructed
with a name and a version profile. `dp.createFunction(name)` returns a `FunctionRef`;
`.build(ctx => …)` fills it in, where `ctx` is a
[`FunctionContext`](/api/helix/classes/FunctionContext) - every `ctx.<command>()`
(vanilla commands and sugar like `say`, `tellraw`, `if`, `give`, score ops) is a typed
method on it.

```ts compile
import { Datapack, v26_2 } from "helix";

const dp = new Datapack("mypack", v26_2);

const load = dp.createFunction("load");
load.build((ctx) => {
  ctx.say("loaded");
});
```

Naming the function `load` (or `tick`) auto-registers it in the matching
`minecraft:load` / `minecraft:tick` function tag - which is why the tag JSON appears
alongside the `.mcfunction`. There's no `fs` or path-building anywhere in feature code;
`dp.writeDatapack(dir)` is the one call that turns the built pack into files on disk
(`buildDatapack(dp)` is the in-memory form used above).

## Targeting: `Selector`

[`Selector`](/api/helix/classes/Selector) builds `@a`/`@e`/`@p`/`@s`/`@r` with a fluent,
version-aware filter chain - `.tag`, `.limit`, `.distance`, `.gamemode`, `.nbt`,
`.score`, and more. You never hand-write `@a[tag=…,limit=1]`.

```ts compile
import { Datapack, v26_2, Selector, text, Color } from "helix";

const dp = new Datapack("mypack", v26_2);

const greet = dp.createFunction("greet");
greet.build((ctx) => {
  const admins = Selector.allPlayers().tag("admin").limit(1);
  ctx.tellraw(admins, [
    text("Welcome back, ").color(Color.GRAY),
    text("operator").color(Color.AQUA),
  ]);
});
```

## Typed values, not strings

Domain concepts - [`Pos`](/api/helix/variables/Pos),
[`Block`](/api/helix/variables/Block), [`Item`](/api/helix/variables/Item),
[`Nbt`](/api/helix/variables/Nbt), [`Id`](/api/helix/variables/Id) - are built with
their own classes and render version-aware at codegen. Handlers never hand-build command
fragments; if a concept isn't expressible yet, the typed API gets extended first.

```ts compile
import { Datapack, v26_2, Pos, Block } from "helix";

const dp = new Datapack("mypack", v26_2);

const platform = dp.createFunction("platform");
platform.build((ctx) => {
  ctx.fill(Pos.rel(-2, 0, -2), Pos.rel(2, 0, 2), Block.STONE);
  ctx.setblock(Pos.here().offset(0, 1, 0), Block.AIR);
});
```

`Pos.rel` renders the `~` form, `Pos.local` renders `^`, and `Block.STONE` is a typed
member off the version's block registry rather than a bare string. Entity NBT is typed the
same way - one factory per entity (`Tnt({ fuse: 40 })`, `Villager({ … })`), covered in
[Items & NBT](/guide/concepts/items-and-nbt#entity-nbt-is-typed-per-entity).

## Scores & control flow

An [`Objective`](/api/helix/classes/Objective) comes from `dp.objective(name, kind?)`;
`.score(target)` gives a [`Score`](/api/helix/classes/Score) cell you can `.set`,
`.add`, `.remove`, `.copy`. Comparison methods (`.equal`, `.greaterThan`, `.lessThan`)
return conditions you feed straight to `ctx.if`, whose body compiles to a child function.

```ts compile
import { Datapack, v26_2, ScoreTarget } from "helix";

const dp = new Datapack("mypack", v26_2);
const score = dp.objective("score");

const reward = dp.createFunction("reward");
reward.build((ctx) => {
  const points = score.score(ScoreTarget("total"));
  ctx.if(points.greaterThan(9), (ctx) => {
    ctx.say("high score!");
    points.set(0, ctx);
  });
});
```

Notice the emitted `reward.mcfunction` calls into a generated child function - the `if`
body - instead of inlining. That's the AST → IR lowering doing its job. For runtime math
beyond integers, [`Fixed`](/api/helix/classes/Fixed) (scale-tracked fixed-point) and
[`ScoreVec3`](/api/helix/classes/ScoreVec3) build on the same `Score` primitive.

## Data resources

A pack is more than functions. Loot tables, recipes, item modifiers, predicates,
advancements and biomes each have a typed builder that registers on the `Datapack` and
returns a reference you can use elsewhere - so a resource is defined once and named,
never re-encoded as a string.

Biomes are the clearest case for building the JSON rather than hand-writing it, because
the format has moved three times across the versions helix supports: `carvers` became a
flat list in 1.21.2, `music` became a weighted list in 1.21.4, and in 1.21.11 nearly all
of a biome's *ambience* left `effects` for the environment-attribute map. You write the
same source either way and
[`BiomeDef`](/api/helix/classes/BiomeDef) places it in the shape the target version
wants.

```ts compile
import {
  Datapack, v26_2, BiomeDef, DecorationStep, SoundEvent, SpawnCategory, EntityType,
} from "helix";

const dp = new Datapack("mypack", v26_2);

// A namespaced name writes into that namespace - here, overriding vanilla's
// plains, which is how a biome takes effect without a custom dimension.
dp.biome(
  "minecraft:plains",
  new BiomeDef()
    .temperature(0.8)
    .downfall(0.4)
    .precipitation(true)
    .effects((e) =>
      e
        .skyColor("#78a7ff")
        .fogColor("#c0d8ff")
        .waterColor("#3f76e4")
        .ambientSound(SoundEvent.AMBIENT_CAVE),
    )
    .spawn(SpawnCategory.CREATURE, EntityType.SHEEP, { weight: 12, min: 4, max: 4 })
    .feature(DecorationStep.VEGETAL_DECORATION, "minecraft:patch_grass_plain"),
);
```

On `v26_2` the sky/fog colours and the ambient sound land in `attributes` under
`minecraft:visual/sky_color` and `minecraft:audio/ambient_sounds`; on `v1_21_4` the same
source puts them in `effects`. Generation steps are named
([`DecorationStep`](/api/helix/variables/DecorationStep)), not array indices, and sounds
are typed ids ([`SoundEvent`](/api/helix/variables/SoundEvent)), not strings.

For a registry with no builder yet - custom dimensions, configured features, chat types -
`dp.registryFile(folder, name, json)` writes raw JSON at the right path, and
`validateDatapack` checks it against the vanilla schema.

## Version profiles

A version profile carries everything version-specific: pack format, folder conventions,
the command grammar, and registry membership. It reaches command handlers only through
`ctx.datapack.version` at call time - handlers are stateless singletons that never bake
in a version. Swap `v26_2` for [`v1_20_4`](/api/helix/variables/v1_20_4) or
[`v1_20_1`](/api/helix/variables/v1_20_1) and the *same* source emits different folder
names (`function/` vs `functions/`) and pack format.

## In-memory codegen, cost & validation

[`buildDatapack(dp)`](/api/helix/functions/buildDatapack) runs the same codegen as
`dp.writeDatapack(path)` but returns a `Map<path, contents>` instead of writing to disk.
Two features build on it - both read the *rendered* output, not the AST:

- **Cost reports** - `dp.report()` / `dp.printReport()` walk the call graph rooted at the
  `tick` tag for worst-case commands/tick and unbounded `@e` scans.
- **JSON validation** - [`validateDatapack(dp)`](/api/helix/functions/validateDatapack)
  checks every emitted JSON resource against the vanilla schema for the pack's target
  version, via Spyglass's mcdoc runtime. Those packages are optional dependencies loaded
  lazily; importing `validateDatapack` doesn't pull them in, only calling it does.

## Resource packs

Alongside the datapack, helix can emit an optional resource pack:
`dp.writeResourcePack(path)` writes an `assets/` tree from
[`Model`](/api/helix/classes/Model), [`BlockState`](/api/helix/classes/BlockState), and
item-definition builders - a separate output, with its own resource-format `pack.mcmeta`,
not folded into `writeDatapack`. Attach a model to an item with
`Item.X.model(dp.model(…))` → the `item_model` component, never a magic
`custom_model_data` number.

## Where to go next

- The [API reference](/api/) - the authoring surface grouped by task, plus the full
  generated listing of every export.
