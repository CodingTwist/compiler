# Conditions, locals, loops and functions

These four let you write logic and leave helix to pick the commands: which `execute`
clauses to chain, which scratch holders to use, and which private functions to split out.

## Conditions

`ctx.if(condition, body)` takes a score comparison, a [`Detect`](/api/helix/variables/Detect)
check, or `and`/`or`/`not` of those. Chain `.elif` and `.else` onto it.

| Condition                                                                                         | Emits                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `score.equal(n)`, `.greaterThan`, `.lessThan`, `.atLeast`, `.atMost`, `.matches(range)`           | `if score … matches …`                                 |
| `a.greaterThan(b)` where both are scores                                                          | `if score a > b`                                       |
| `Detect.entity(sel)`, `Detect.noEntity(sel)`, `Detect.block(pos, block)`, `Detect.predicate(ref)` | `if entity …`, `unless entity …`, …                    |
| `and(a, b)`                                                                                       | one `execute` with both clauses                        |
| `or(a, b)`, `not(and(a, b))`                                                                      | one line per alternative, and the body still runs once |

```ts compile
import { Datapack, v26_2, Detect, Selector, Range, and, or } from "helix";

const dp = new Datapack("flow", v26_2);
const hp = dp.objective("hp").score(Selector.self());
const shield = dp.objective("shield").score(Selector.self());

dp.createFunction("tick").build((ctx) => {
  ctx
    .if(
      and(
        hp.atMost(4),
        Detect.noEntity(
          Selector.allPlayers().distance(new Range(undefined, 8)),
        ),
      ),
      (c) => c.say("fleeing"),
    )
    .elif(or(hp.lessThan(shield), shield.equal(0)), (c) => c.say("guarding"))
    .else((c) => c.say("attacking"));
});
```

Only one branch runs, even when a body changes the scores its own condition read. With
`elif`, `else` or `or`, helix puts the branches in a private function that stops at the
first match. Versions without `return run` (1.20.1) record the branch taken in a local
instead.

## Locals

`ctx.let(init?)` returns a fresh `Score` on the `helix.var` objective, named after the
function, so you never have to pick holder names. `init` can be a number, a score, or a
`` math`…` `` expression. The objective is only created when a function uses a local.

```ts compile
import { Datapack, v26_2, Selector, math } from "helix";

const dp = new Datapack("flow", v26_2);
const x = dp.objective("x").score(Selector.self());
const z = dp.objective("z").score(Selector.self());

dp.createFunction("tick").build((ctx) => {
  const distSq = ctx.let(math`${x} * ${x} + ${z} * ${z}`);
  ctx.if(distSq.lessThan(100), (c) => c.say("close"));
});
```

A recursive call reuses its caller's holders, so don't count on a local keeping its value
across a call to the same function.

## Loops

`ctx.repeat(n, (ctx, i) => …)` runs the body `n` times, with `i` counting up from 0.
`ctx.while(cond, body, { advance })` runs the body while `cond` holds, and `advance`
shifts the context for each pass, which is how you step a ray. `.else` runs where the loop
stopped.

```ts compile
import { Datapack, v26_2, Detect, Pos, Block, Selector } from "helix";

const dp = new Datapack("flow", v26_2);

dp.createFunction("look").build((ctx) => {
  ctx.repeat(3, (c, i) => c.tellraw(Selector.allPlayers(), [i]));
  ctx
    .while(Detect.block(Pos.here(), Block("#minecraft:air")), () => {}, {
      advance: (e) => e.positioned(Pos.local(0, 0, 0.5)),
    })
    .else((c) => c.say("hit"));
});
```

Both need `return run`. A loop is a recursive function, so `maxCommandChainLength` limits
how many passes fit in one tick.

## Functions

`dp.fn(name, (ctx, ...params) => result)` defines a function that takes scores and can
return one. `ctx.invoke(fn, args, into?)` copies the arguments into its parameters and
stores the result in `into`. The argument count is checked at build time.

```ts compile
import { Datapack, v26_2, Selector } from "helix";

const dp = new Datapack("flow", v26_2);
const hp = dp.objective("hp").score(Selector.self());

const clamp = dp.fn("clamp", (_ctx, v, hi) => v.min(hi));
dp.createFunction("heal").build((ctx) => {
  hp.add(5);
  ctx.invoke(clamp, [hp, 20], hp);
});
```

Parameters and results are integer scores. For NBT arguments, use a macro function with
`callWith`.
