# API Reference

Helix exports ~200 symbols, but you only reach for a couple of dozen when **authoring a
pack**. The rest are the compiler's internals - IR nodes, command handlers, codegen
infrastructure - public so the upper layers can build on them, but not something you use
to write gameplay.

This page is the curated **authoring surface**: the classes and factories you actually
build packs with, grouped by task. Each links into its full generated page. If you want
the exhaustive, every-symbol listing, jump to the [full generated reference](#full-generated-reference)
at the bottom.

## Building a pack

Everything hangs off one [`Datapack`](/api/helix/classes/Datapack). You create functions
on it and fill them in against a [`FunctionContext`](/api/helix/classes/FunctionContext),
where every `ctx.<command>()` lives.

| Symbol | What it's for |
| --- | --- |
| [`Datapack`](/api/helix/classes/Datapack) | The pack itself: `createFunction`, `objective`, `writeDatapack`, resource files, `report()`. |
| [`FunctionContext`](/api/helix/classes/FunctionContext) | The `ctx` inside `.build()` - every command (`say`, `tellraw`, `if`, `fill`, score ops…) is a method here. |
| [`FunctionRef`](/api/helix/interfaces/FunctionRef) | What `createFunction` returns; call `.build(ctx => …)` on it. |
| version profiles | [`v1_20_1`](/api/helix/variables/v1_20_1), [`v1_20_4`](/api/helix/variables/v1_20_4), [`v1_21_4`](/api/helix/variables/v1_21_4), [`v26_2`](/api/helix/variables/v26_2) - pass one to `new Datapack`. |

```ts compile
import { Datapack, v26_2 } from "helix";

const dp = new Datapack("demo", v26_2);

const load = dp.createFunction("load");
load.build((ctx) => {
  ctx.say("hello from helix");
});
```

Naming a function `load` (or `tick`) auto-registers it in the matching
`minecraft:load` / `minecraft:tick` tag - that's why the tag JSON appears alongside the
`.mcfunction` above.

## Targeting entities

| Symbol | What it's for |
| --- | --- |
| [`Selector`](/api/helix/classes/Selector) | `@a`/`@e`/`@p`/`@s`/`@r` plus a fluent, version-aware filter chain (`.tag`, `.limit`, `.distance`, `.gamemode`, `.nbt`, `.score`…). |
| [`ScoreTarget`](/api/helix/variables/ScoreTarget) | A score holder - a fake player name or a selector - for `objective.score(…)`. |

```ts compile
import { Datapack, v26_2, Selector, text, Color } from "helix";

const dp = new Datapack("demo", v26_2);

const greet = dp.createFunction("greet");
greet.build((ctx) => {
  const admins = Selector.allPlayers().tag("admin").limit(1);
  ctx.tellraw(admins, [
    text("Welcome back, ").color(Color.GRAY),
    text("operator").color(Color.AQUA),
  ]);
});
```

## Typed values

Domain concepts are built with their own classes and render **version-aware** at
codegen - never string-interpolated. If a value can't express something yet, the fix is
to extend the value's API, not to hand-build a fragment.

| Symbol | What it's for |
| --- | --- |
| [`Pos`](/api/helix/variables/Pos) | Coordinates: `Pos(x,y,z)`, `Pos.rel(…)`, `Pos.local(…)`, `Pos.here()`, `.offset`, `.center`. |
| [`Block`](/api/helix/variables/Block) | `Block.STONE`, `Block(id, states)`, `Block.tag(…)`. |
| [`Item`](/api/helix/variables/Item) | Item stacks with components; renders differently as a give-stack vs predicate JSON. |
| [`Nbt`](/api/helix/variables/Nbt) | Typed NBT compounds/lists/numbers (`Byte`/`Short`/`Float`/`Double`/`Long`). |
| [`Id`](/api/helix/variables/Id) | Namespaced resource ids. |

```ts compile
import { Datapack, v26_2, Pos, Block } from "helix";

const dp = new Datapack("demo", v26_2);

const platform = dp.createFunction("platform");
platform.build((ctx) => {
  ctx.fill(Pos.rel(-2, 0, -2), Pos.rel(2, 0, 2), Block.STONE);
  ctx.setblock(Pos.here().offset(0, 1, 0), Block.AIR);
});
```

## Scores & math

| Symbol | What it's for |
| --- | --- |
| [`Objective`](/api/helix/classes/Objective) | A scoreboard objective (`dp.objective(name, kind?)`); `.score(target)` gives a `Score`. |
| [`Score`](/api/helix/classes/Score) | A live score cell: `.set`/`.add`/`.remove`/`.copy` and comparisons (`.equal`, `.greaterThan`, `.lessThan`) that become `if` conditions. |
| [`Fixed`](/api/helix/classes/Fixed) | Scale-tracked fixed-point scalar for precision-safe runtime math. |
| [`ScoreVec3`](/api/helix/classes/ScoreVec3) | A 3-vector of scores for runtime vector math. |

```ts compile
import { Datapack, v26_2, ScoreTarget } from "helix";

const dp = new Datapack("demo", v26_2);
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

The `if` body compiles to its own child function - that's why a second `.mcfunction`
appears in the output above.

## Text & chat

| Symbol | What it's for |
| --- | --- |
| [`text`](/api/helix/functions/text) | Build a single styled text span (`.color(Color.X)`, bold/italic, click/hover). |
| [`TellrawText`](/api/helix/classes/TellrawText) | A named, reusable sequence of parts for `ctx.tellraw`/`ctx.title`. |
| [`ClickEvent`](/api/helix/classes/ClickEvent) / [`HoverEvent`](/api/helix/classes/HoverEvent) | Interactivity attached to a `Text`. |

## Data resources

Loot tables, recipes, predicates, item modifiers, advancements and models are typed
builders on the `Datapack` - the emitted JSON is derived from the same value objects you
author commands with.

| Symbol | What it's for |
| --- | --- |
| [`Predicate`](/api/helix/classes/Predicate) | Referenceable predicate JSON; feeds `Selector.predicate`. |
| [`LootTableDef`](/api/helix/classes/LootTableDef) / [`ItemModifier`](/api/helix/classes/ItemModifier) | Loot & item-modifier resources. |
| [`RecipeDef`](/api/helix/classes/RecipeDef) | Recipe resources. |
| [`AdvancementDef`](/api/helix/classes/AdvancementDef) / [`Trigger`](/api/helix/classes/Trigger) | Typed advancements. |
| [`Model`](/api/helix/classes/Model) / [`ItemModel`](/api/helix/classes/ItemModel) / [`BlockState`](/api/helix/classes/BlockState) | Resource-pack outputs (`dp.writeResourcePack`). |

## Build, cost & validation

| Symbol | What it's for |
| --- | --- |
| [`buildDatapack`](/api/helix/functions/buildDatapack) | Run codegen in-memory → `Map<path, contents>` (the disk form is `dp.writeDatapack`). |
| [`analyzeCost`](/api/helix/functions/analyzeCost) / [`formatCostReport`](/api/helix/functions/formatCostReport) | Worst-case commands/tick and unbounded-`@e` detection (`dp.report()`). |
| [`validateDatapack`](/api/helix/functions/validateDatapack) | Check emitted JSON against the vanilla schema for the target version (optional Spyglass deps). |

---

## Full generated reference

Every exported symbol, generated from source with `npm run gen:api` (build `helix`
first). Reach for these when you need the internals, not just the authoring surface:

- [**helix**](/api/helix/) - the core compiler (all ~200 exports).
- [**spool**](/api/spool/) - opt-in conveniences: `KitPlugin`, `installKit`, the plugin catalog.
- [**twine**](/api/twine/) - the opinionated framework: module / area / lifecycle
  composition, `defineItem`, `StateMachine`.

For narrative introductions, start with the [Guide](/guide/getting-started); for the
authoring concepts in depth, see the [helix guide](/guide/helix).
