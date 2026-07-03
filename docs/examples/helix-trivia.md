# Plain helix: TSTrivia

`unravel` is the "plain helix" worked example: a real trivia pack (`TSTrivia`) authored
directly against helix's public API, with no `twine` framework and no `spool` plugins.
It's pinned to an older version profile (`v1_20_4`) on purpose, so it also doubles as a
back-compat canary for helix changes.

## The shared `Datapack`

Every module in the pack imports one `Datapack` instance:

```ts
// unravel/src/datapack.ts
import { Datapack, v1_20_4 } from "helix";

export const dataPack = new Datapack("TSTrivia", v1_20_4);
```

## Declaring shared state

The entry point declares the pack's objectives up front, then pulls in each feature
module:

```ts
// unravel/src/index.ts
import { config } from "./config";
import { dataPack } from "./datapack";

export const correctObj = dataPack.objective("correct", "trigger");
export const triviaObj = dataPack.objective("trivia");

export * from "./load";
export * from "./questions";
export * from "./types";
export * from "./randomQuestion";
export * from "./tick";

dataPack.writeDatapack(config.output);

export { dataPack };
```

## A function, built with typed values

`dp.createFunction(name, ...tags)` returns a `FunctionRef`; `.build(ctx => ...)` fills
it in. Every value - the tellraw text, score targets, selectors - is a typed helix
class, never a hand-built string:

```ts
// unravel/src/load.ts
import { text, Color, Selector, ScoreTarget } from "helix";
import { dataPack } from "./datapack";
import { question } from "./randomQuestion";
import { correctObj, triviaObj } from ".";

export const load = dataPack.createFunction("load");
load.build((ctx) => {
  ctx.tellraw(Selector.allPlayers(), [
    text("[TSTrivia] ").color(Color.GOLD),
    text("Successfully loaded!").color(Color.GREEN),
  ]);

  const rng = triviaObj.score(ScoreTarget("rng")).set(0, ctx);
  const timer = triviaObj.score(ScoreTarget("timer")).set(0, ctx);
  const time = triviaObj.score(ScoreTarget("time")).set(500, ctx);
  timer.copy(ctx, time);

  ctx.scoreEnable(Selector.allPlayers(), correctObj);
  ctx.call(question);
});
```

## What the compiler emits

Here's a self-contained version of that `load` function. The **Compiled output** panels
below it aren't hand-written - the docs build runs *this exact source* through helix and
inlines whatever it emits, so the two can never drift apart:

```ts compile
import { Datapack, v1_20_4, Selector, ScoreTarget, text, Color } from "helix";

const dp = new Datapack("TSTrivia", v1_20_4);
const correctObj = dp.objective("correct", "trigger");
const triviaObj = dp.objective("trivia");

const load = dp.createFunction("load");
load.build((ctx) => {
  ctx.tellraw(Selector.allPlayers(), [
    text("[TSTrivia] ").color(Color.GOLD),
    text("Successfully loaded!").color(Color.GREEN),
  ]);

  const time = triviaObj.score(ScoreTarget("time")).set(500, ctx);
  const timer = triviaObj.score(ScoreTarget("timer")).set(0, ctx);
  timer.copy(ctx, time);

  ctx.scoreEnable(Selector.allPlayers(), correctObj);
});
```

Naming the function `load` auto-registers it in the `minecraft:load` tag, which is why the
tag JSON appears alongside the `.mcfunction`.

Note there's no `fs`/path-building anywhere in the pack's feature code - `writeDatapack`
is the one call, at the very end of `index.ts`, that turns the built `Datapack` into
files on disk.

## Build it

```sh
cd unravel
npm install
npm run build   # tsc && node dist/index.js
```

See the full source under `unravel/src/`, and the [helix guide](/guide/helix) for the
concepts (`Datapack`, `FunctionContext`, typed values, version profiles) this example
leans on.
