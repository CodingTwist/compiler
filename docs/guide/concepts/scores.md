# Scores

A [`Score`](/api/helix/classes/Score) is one scoreboard cell - an `(objective, target)`
pair - with typed methods for every scoreboard operation. You get one from an
[`Objective`](/api/helix/classes/Objective):

```ts
const game = dp.objective("game");        // scoreboard objective
const score = game.score(ScoreTarget("total"));   // one cell on it
```

`ScoreTarget` is the holder - a fake-player name like `"total"`, or a selector. The
`Score` object is just a handle; nothing is emitted until you call a mutating method
**with a context**.

## Two families of operation

Minecraft splits score math into two commands, and `Score` mirrors that split with two
naming families. Getting them straight is the one thing worth internalising here.

| You want… | Method | Emits |
| --- | --- | --- |
| set/add/remove a **literal integer** | `.set(n)` `.add(n)` `.remove(n)` | `scoreboard players set/add/remove … n` |
| combine with **another score** | `.assign` `.plus` `.minus` `.times` `.divide` `.modulo` `.min` `.max` `.swap` | `scoreboard players operation … <op> …` |

The verbs differ on purpose: `add`/`remove` are taken by the *literal-constant*
commands, so score-to-score `+=`/`-=` are `plus`/`minus`. All the `operation` verbs
return `this`, so they chain - `acc.times(k).plus(delta)` reads as algebra.

```ts compile
import { Datapack, v26_2, ScoreTarget } from "helix";

const dp = new Datapack("scores", v26_2);
const game = dp.objective("game");

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const score = game.score(ScoreTarget("score"));
  const bonus = game.score(ScoreTarget("bonus"));

  score.add(1, ctx);        // literal:        scoreboard players add … 1
  score.plus(bonus, ctx);   // score-to-score: score += bonus
});
```

## The context argument

Every mutating method takes an optional trailing `ctx`. That's *where the command is
emitted*. Inside a `.build()`, `.run()`, or `.if()` callback there is an **ambient
context**, so the `operation` verbs (`plus`, `times`, …) can find it themselves - but the
literal `set`/`add`/`remove` only emit when you pass `ctx` explicitly (without it they
just record the pending value). The habit that always works: **pass `ctx`**. Pass it
explicitly too when two contexts are in scope and you mean the outer one.

## Comparisons drive control flow

`.equal`, `.greaterThan`, and `.lessThan` don't emit - they return a *condition* you hand
to [`ctx.if`](/api/helix/classes/FunctionContext). The `if` body compiles to its own
child function, which is why you'll see a second `.mcfunction` in the output:

```ts compile
import { Datapack, v26_2, ScoreTarget } from "helix";

const dp = new Datapack("scores", v26_2);
const game = dp.objective("game");

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const score = game.score(ScoreTarget("score"));
  ctx.if(score.greaterThan(100), (ctx) => {
    score.set(0, ctx);   // reset once we cross the threshold
  });
});
```

(Score-to-score comparisons aren't wired up yet - `greaterThan(otherScore)` throws. Feed
a literal, or diff into a scratch score first.)

## Capturing a command's result

`score.storeResult(ctx, command)` wraps a command in `execute store result score …`, so a
count or query lands directly in a cell - the typed form of `execute store result score`.

## Going further

For vector algebra over three cells at once, see [Score vectors](/guide/concepts/score-vectors);
for sub-integer precision, [`Fixed`](/api/helix/classes/Fixed) tracks a scale factor on
top of this same `Score` primitive.
