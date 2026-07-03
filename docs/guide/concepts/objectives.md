# Objectives

An [`Objective`](/api/helix/classes/Objective) is a named scoreboard objective - the thing a
[`Score`](/guide/concepts/scores) lives *on*. You get one from the datapack, and it's
idempotent: `dp.objective("game")` returns the same object every time, so separate modules
can ask for the same objective without fighting over who declares it.

```ts
const game = dp.objective("game");                 // dummy (default)
const home = dp.objective("home", "trigger");      // a /trigger objective
```

## Kinds

The second argument is the tracking criterion:

| Kind | Meaning |
| --- | --- |
| `"dummy"` (default) | only your commands change it - the normal working objective |
| `"trigger"` | the player may change their own via `/trigger` (once enabled) |
| `` `minecraft.${string}` `` | mirrors a vanilla statistic/criterion |

Redeclaring a name with a *different* kind throws - that mismatch is a bug, not something to
paper over.

## Declaring vs. using

`dp.objective(...)` registers the objective in TS, but the scoreboard command that *creates*
it in-game is `ctx.scoreInit(obj)` - call it once from your load function. After that,
`obj.score(target)` gives you a cell to read and write:

```ts compile
import { Datapack, v26_2, ScoreTarget, Selector } from "helix";

const dp = new Datapack("game", v26_2);
const game = dp.objective("game");

const load = dp.createFunction("load");
load.build((ctx) => {
  ctx.scoreInit(game);                    // scoreboard objectives add game dummy
  game.score(ScoreTarget("#round")).set(0, ctx);
});

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  game.score(Selector.allPlayers()).add(1, ctx);   // every player
});
```

## Who holds the score

`obj.score(target)` accepts either a [`Selector`](/guide/concepts/selectors) (real entities
- `@a`, `@s`) or a [`ScoreTarget`](/api/helix/classes/ScoreTargetValue) for a **fake
player**: a bare name like `#round` that no entity owns, the idiomatic home for globals and
scratch values (the `#` prefix keeps it out of the sidebar). Both are legitimate score
holders, so both are first-class here - a fake player is a concept, not a string hack.

## Triggers: letting players write their own score

A `"trigger"` objective is the one score players can change themselves, via `/trigger`. You
enable it per player (`ctx.scoreEnable` / `obj.enable(ctx, sel)`), they run the command, and
you read the result next tick, then re-enable. It's the standard "menu click" / player-input
primitive.

```ts compile
import { Datapack, v26_2, Selector, ScoreTarget, Range } from "helix";

const dp = new Datapack("menu", v26_2);
const home = dp.objective("home", "trigger");

const setup = dp.createFunction("setup");
setup.build((ctx) => {
  ctx.scoreInit(home);
  ctx.scoreEnable(Selector.allPlayers(), home);   // players may now /trigger home
});

const poll = dp.createFunction("poll");
poll.build((ctx) => {
  const clicked = home.score(Selector.self());
  ctx.if(clicked.greaterThan(0), (ctx) => {
    ctx.tellraw(Selector.self(), "teleporting home…");
  });
});
```

## Statistic criteria (right-click detection)

The `minecraft.*` criteria mirror vanilla stats. The one worth knowing is
[`usedStatCriteria(item)`](/api/helix/functions/usedStatCriteria): an objective on
`minecraft.used:<item>` counts how many times the player *used* (right-clicked) that item -
the canonical right-click detector for a `carrot_on_a_stick`-style usable. Reset it each
tick; a value `>= 1` next tick means a use happened. It's derived from the item's own id, so
it stays in lockstep with the [`Item`](/guide/concepts/items-and-nbt) you give.

## Going further

Everything you *do* with a cell - arithmetic, comparisons, control flow - lives on
[`Score`](/guide/concepts/scores). For three-at-once vector cells see
[Score vectors](/guide/concepts/score-vectors), and for fractional values
[Fixed-point numbers](/guide/concepts/fixed).
