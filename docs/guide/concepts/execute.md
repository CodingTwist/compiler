# Execute chains

`ctx.execute()` builds the general `execute … run …` chain - the one command that composes
context shifts, guards, and result capture. The
[`ctx.execute()`](/api/helix/classes/FunctionContext) builder models the whole grammar: each
method appends one clause **in call order**, and `.run(body)` terminates the chain.

The narrower helpers (`selector.run(...)` for a bare `as`, `score.storeResult(...)` for one
store) are shortcuts over this; reach for `ctx.execute()` when you need several clauses.

## The clauses

Context shifts move the execution position/rotation/dimension/executor:

| Method | Clause |
| --- | --- |
| `.as(sel)` / `.at(sel)` | `as` / `at` |
| `.positioned(pos)` / `.positionedAs(sel)` | `positioned` / `positioned as` |
| `.rotatedAs(sel)` | `rotated as` |
| `.facing(pos)` / `.facingEntity(sel, anchor)` | `facing` / `facing entity` |
| `.anchored(EntityAnchor.EYES \| .FEET)` | `anchored` |
| `.in(dim)` | `in <dimension>` |

Guards keep or drop the chain (each has an `unless…` twin):

| Method | Clause |
| --- | --- |
| `.ifEntity(sel)` | `if entity <sel>` |
| `.ifBlock(pos, block)` | `if block <pos> <block>` |
| `.ifScoreMatches(score, range)` | `if score … matches <range>` |
| `.ifScore(a, op, b)` | `if score … <op> …` (`<`, `<=`, `=`, `>=`, `>`) |
| `.ifPredicate(ref)` | `if predicate <id>` |

Stores write the run target's result/success into a score or storage:

| Method | Clause |
| --- | --- |
| `.storeResultScore(score)` / `.storeSuccessScore(score)` | `store result\|success score` |
| `.storeResultStorage(id, path, type, scale)` | `store result storage …` |

```ts compile
import { Datapack, v26_2, Selector, Pos, Block, Range } from "helix";

const dp = new Datapack("gameplay", v26_2);
const game = dp.objective("game");

const fn = dp.createFunction("standing_on_gold");
fn.build((ctx) => {
  ctx.execute()
    .as(Selector.allPlayers())
    .at(Selector.self())
    .ifBlock(Pos.rel(0, -1, 0), Block.GOLD_BLOCK)
    .ifScoreMatches(game.score(Selector.self()), new Range(1, undefined))
    .run((ctx) => {
      ctx.say("standing on gold with a positive score");
    });
});
```

## The `run` body compiles like `if`

`.run(build)` captures the body into a child function, and it lowers the same way `ctx.if`
does: a **single-command** body inlines straight into the `run` clause (no extra file), a
**multi-command** body commits to its own `.mcfunction`. You don't decide - the compiler
does, based on what you emit.

```ts compile
import { Datapack, v26_2, Selector } from "helix";

const dp = new Datapack("gameplay", v26_2);
const game = dp.objective("game");

const fn = dp.createFunction("count_players");
fn.build((ctx) => {
  // store result score: land the count of matching players in a cell.
  ctx.execute()
    .storeResultScore(game.score(Selector.self()))
    .run((ctx) => {
      ctx.say("counting");
    });
});
```

## Going further

Clauses take the same typed values as everywhere else - [`Selector`](/guide/concepts/selectors),
[`Pos`/`Block`](/guide/concepts/positions-and-blocks), [`Score`](/guide/concepts/scores),
`Range`. For returning a command's result up to the caller, `ctx.returnRun(body)` is the
`return run …` sibling on the same builder file.
