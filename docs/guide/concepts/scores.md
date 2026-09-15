# Scores

A [`Score`](/api/helix/classes/Score) is one scoreboard cell - an `(objective, target)`
pair - with typed methods for every scoreboard operation. You get one from an
[`Objective`](/api/helix/classes/Objective):

```ts
const game = dp.objective("game"); // scoreboard objective
const score = game.score(ScoreTarget("total")); // one cell on it
```

`ScoreTarget` is the holder - a fake-player name like `"total"`, or a selector. The
`Score` object is just a handle; nothing is emitted until you call a mutating method
**with a context**.

## Two families of operation

Minecraft splits score math into two commands, and `Score` mirrors that split with two
naming families. Getting them straight is the one thing worth internalising here.

| You want…                            | Method                                                                        | Emits                                   |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------- |
| set/add/remove a **literal integer** | `.set(n)` `.add(n)` `.remove(n)`                                              | `scoreboard players set/add/remove … n` |
| combine with **another score**       | `.assign` `.plus` `.minus` `.times` `.divide` `.modulo` `.min` `.max` `.swap` | `scoreboard players operation … <op> …` |

The verbs differ on purpose: `add`/`remove` are taken by the _literal-constant_
commands, so score-to-score `+=`/`-=` are `plus`/`minus`. All the `operation` verbs
return `this`, so they chain - `acc.times(k).plus(delta)` reads as algebra.

It only _reads_ as algebra, though: a chain is a sequence of mutations, one command each,
and it can't express anything with a nested term (`(a + b) * c` needs a scratch cell you
manage yourself). When you're writing a formula rather than stepping a counter, use
`` math`…` `` - see [Math and `/compute`](/guide/concepts/math-and-compute).

```ts compile
import { Datapack, v26_2, ScoreTarget } from "helix";

const dp = new Datapack("scores", v26_2);
const game = dp.objective("game");

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const score = game.score(ScoreTarget("score"));
  const bonus = game.score(ScoreTarget("bonus"));

  score.add(1); // literal:        scoreboard players add … 1
  score.plus(bonus); // score-to-score: score += bonus
});
```

## The context argument

Every mutating method (`set`/`add`/`remove`/`reset` and the `operation` verbs `plus`,
`times`, ...) emits into the **ambient context** - the `.build()`, `.run()`, or `.if()`
callback you are inside - so you never pass it. Outside any callback there is no ambient
context and the call throws. Pass `ctx` explicitly only when two contexts are in scope
and you mean the outer one.

## Comparisons drive control flow

`.equal`, `.greaterThan`, and `.lessThan` don't emit - they return a _condition_ you hand
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
    score.set(0); // reset once we cross the threshold
  });
});
```

They take another score too (`hp.lessThan(shield)`). For `elif`/`else`, `and`/`or`,
locals, loops and functions, see [Conditions, locals, loops and functions](/guide/concepts/control-flow).

## Capturing a command's result

`ctx.execute().storeResultScore(score).run(...)` lands a count or query directly in a
cell - see [Execute chains](/guide/concepts/execute).

## Going further

For whole formulas in one expression - and the single `/compute` they become on 26.3+ -
see [Math and `/compute`](/guide/concepts/math-and-compute). For vector algebra over three
cells at once, see [Score vectors](/guide/concepts/score-vectors); for sub-integer
precision, [`Fixed`](/api/helix/classes/Fixed) tracks a scale factor on top of this same
`Score` primitive.
