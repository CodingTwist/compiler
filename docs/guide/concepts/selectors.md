# Selectors

A [`Selector`](/api/helix/classes/Selector) is a typed target expression - the `@a`, `@e`,
`@s`, `@p`, `@r` you'd hand-write, but built as an object so every filter is checked and
rendered version-aware. You never string together `@a[distance=..6,tag=it]` by hand.

## Building one

Start from a base and chain filters. Every filter method returns `this`, so they read as
one fluent expression, and the order you add them in doesn't matter:

| Start from | Base |
| --- | --- |
| `Selector.allPlayers()` | `@a` |
| `Selector.allEntities()` | `@e` |
| `Selector.self()` | `@s` |
| `Selector.nearest()` | `@p` |
| `Selector.random()` | `@r` |
| `Selector.uuid(id)` | a bare UUID / player name |

The filters cover the vanilla selector arguments as typed values - note `distance`,
`score`, and `volume` take real [`Range`](/api/helix/classes/Range),
[`Objective`](/api/helix/classes/Objective), and corner tuples rather than string
fragments:

| Method | Selector arg |
| --- | --- |
| `.tag(name)` | `tag=` (repeatable) |
| `.limit(n)` / `.sort(order)` | `limit=` / `sort=` |
| `.distance(range)` | `distance=` (a `Range` - `new Range(undefined, 6)` is `..6`) |
| `.score(objective, range)` | `scores={…}` |
| `.gamemode(mode)` | `gamemode=` |
| `.team(name)` / `.name(name)` | `team=` / `name=` |
| `.nbt(nbt)` | `nbt={…}` (an [`Nbt`](/api/helix/classes/NbtValue) value) |
| `.predicate(ref)` | `predicate=` (repeatable) |
| `.volume(from, to)` | `x/y/z` + `dx/dy/dz` from two corners |
| `.xRotation(range)` / `.yRotation(range)` | `x_rotation=` / `y_rotation=` |

```ts compile
import { Datapack, v26_2, Selector, Range, Gamemode, Sort } from "helix";

const dp = new Datapack("targets", v26_2);
const game = dp.objective("game");

const fn = dp.createFunction("reward_nearby");
fn.build((ctx) => {
  const winners = Selector.allPlayers()
    .gamemode(Gamemode.SURVIVAL)
    .distance(new Range(undefined, 8))  // within 8 blocks: ..8
    .score(game, new Range(10, undefined))  // score >= 10
    .sort(Sort.NEAREST)
    .limit(3);

  ctx.tellraw(winners, "you're close enough to win");
});
```

A [`Range`](/api/helix/classes/Range) is `new Range(min, max)` - either bound may be
`undefined` for an open end (`new Range(undefined, 8)` → `..8`, `new Range(10, undefined)`
→ `10..`, `new Range(3, 3)` → the exact value `3`).

## Where selectors go

A `Selector` renders itself version-aware, so you pass the object straight into any
command that takes a target - `ctx.tellraw`, `ctx.playerGive`, `ctx.summon` positioning,
every `execute` clause. See [Execute chains](/guide/concepts/execute) for `.as`/`.at`, and
[Scores](/guide/concepts/scores) for scoring a whole selector at once.

## Running a body per match

`selector.run(fn)` wraps a body in `execute as <selector> run …` - the typed form of
"do this once per matching entity", with `@s` bound to each match inside the callback:

```ts compile
import { Datapack, v26_2, Selector } from "helix";

const dp = new Datapack("targets", v26_2);

const fn = dp.createFunction("tag_creepers");
fn.build((ctx) => {
  Selector.allEntities()
    .name("Creeper")
    .run((ctx) => {
      ctx.tellraw(Selector.self(), "you have been tagged");
    })(ctx);
});
```

## Cheap membership checks with predicates

`.predicate(ref)` is the engine-evaluated stand-in for inlining a big `nbt={…}` match into
the selector: register the check once with `dp.predicate(...)`, then reference it from any
selector (repeatable to AND several). See [Data resources](/guide/concepts/data-resources)
for building predicates.
