# Math and `/compute`

Minecraft 26.3 added `/compute` - one command that evaluates a whole arithmetic tree
server-side, with real floats and functions like `sqrt`. Below that version, the only way
to do arithmetic is a chain of `scoreboard players operation` commands over scratch
scores. helix gives you two ways in:

- **`` math`…` ``** - infix integer algebra over `Score`/`ScoreVec3`, and the one you
  should reach for. Write the formula once; helix lowers it to a single `/compute` on 26.3+
  or the equivalent operation chain below it, whichever the target version needs.
- **`ctx.compute()`** with **`ContextInt`/`ContextFloat`** - `/compute`'s full expression
  language, as a typed builder, with no fallback at all. The only way to reach floats,
  `sqrt`/`sin`/`cos`, `uniform`, storage and context-score reads. 26.3+ only, no exceptions.

The split is *not* two syntaxes for the same job: everything with a pre-26.3 equivalent is
`math`'s, and `ctx.compute()` covers only what a scoreboard fundamentally cannot do. Read
[Scores](/guide/concepts/scores) and [Score vectors](/guide/concepts/score-vectors) first if
you haven't - both read and write ordinary `Score` cells.

## `math` - portable integer algebra

```ts
math`-${dot} + min((${distSq} - ${ropeLenSq}) / ${BAUM_DIV}, ${BAUM_MAX})`.into(coef);
```

`${}` holes are ordinary TypeScript - a `Score`, a `ScoreVec3`, a number, or another `math`
expression - so autocomplete works as normal; only the operators are text. Call `.into(dest)`
to emit it; `dest` is a `Score` for a scalar formula or a `ScoreVec3` for a vector one.

Available: `+ - * / %`, unary `-`, `min`, `max`, `abs`, `dot`/`·`, `len2`, `vec`. Scores are
integers - `/` floors toward `-∞` and `%` is floor-modulo, matching
`scoreboard players operation` (the side that can't change), so on 26.3+ it lowers to
`floor_div`/`floor_mod`, not float division.

### Pythagorean theorem, and the AST underneath

`` math`…` `` doesn't run your formula directly - it parses the template into the
{@link ExprNode} tree from `frontend/nodes/expr.ts` (a plain `{ kind, op, args }` data
structure, no version or context attached), and it's *that* tree the handler lowers, either
to `/compute` or an operation chain. `a² + b²` shows the shape clearly - two `mul` nodes
under one `add`:

```ts
const legA = stats.score(ScoreTarget("a"));
const legB = stats.score(ScoreTarget("b"));

math`${legA} * ${legA} + ${legB} * ${legB}`.val;
// {
//   vec: false,
//   e: {
//     kind: "op", op: "add",
//     args: [
//       { kind: "op", op: "mul", args: [{ kind: "score", score: legA }, { kind: "score", score: legA }] },
//       { kind: "op", op: "mul", args: [{ kind: "score", score: legB }, { kind: "score", score: legB }] },
//     ],
//   },
// }
```

Every operator in the template becomes an `op` node, every `${}` hole a `score`/`lit` leaf -
the same tree shape regardless of which backend ends up rendering it. Put to work, that's
just the squared distance between two legs of a right triangle:

```ts compile
import { Datapack, v26_2, ScoreTarget, math } from "helix";

const dp = new Datapack("pythagoras-demo", v26_2);
const stats = dp.objective("stats");

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const legA = stats.score(ScoreTarget("a"));
  const legB = stats.score(ScoreTarget("b"));
  const hypSq = stats.score(ScoreTarget("hyp_sq"));

  // hypSq = a^2 + b^2 - the theorem, minus the square root (scores are integers;
  // see below for the real `sqrt` on 26.3+).
  math`${legA} * ${legA} + ${legB} * ${legB}`.into(hypSq, ctx);
});
```

### A vector formula

`ScoreVec3` holes broadcast per axis; `·`/`dot()` and `len2()` collapse a vector to a
scalar, `vec(a, b, c)` builds one:

```ts compile
import { Datapack, v26_2, ScoreTarget, ScoreVec3, math } from "helix";

const dp = new Datapack("math-vec-demo", v26_2);
const phys = dp.objective("phys");
const cell = (name) => phys.score(ScoreTarget(name));

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const pos = new ScoreVec3(cell("px"), cell("py"), cell("pz"));
  const vel = new ScoreVec3(cell("vx"), cell("vy"), cell("vz"));
  const gravity = cell("gravity"); // negative, scaled

  // pos += vec(vx, vy + gravity, vz)   (per-axis update in one formula)
  math`vec(${vel.x}, ${vel.y} + ${gravity}, ${vel.z})`.into(vel);
  math`${pos.x} + ${vel.x}`.into(pos.x, ctx);
  math`${pos.y} + ${vel.y}`.into(pos.y, ctx);
  math`${pos.z} + ${vel.z}`.into(pos.z, ctx);

  // speedSq = |vel|^2, one dot-product formula instead of three multiplies + two adds
  const speedSq = cell("speedSq");
  math`len2(${vel})`.into(speedSq, ctx);
});
```

## `ctx.compute()` - the full 26.3+ expression language

`/compute`'s expression language comes as two separate typed builders - int and float are
kept apart because `sqrt`/`sin`/`cos` only exist on float and
`floor_div`/`floor_mod`/`binomial` only on int - that build a
`ContextIntProvider`/`ContextFloatProvider` tree.

There is deliberately no version-aware wrapper around them. Every op these builders add
over `` math`…` `` - `avg`, `pow`, `uniform`, `conditional`, `binomial`, `contextScore`,
truncating `div`/`mod`, `storage`, `raw`, and all of `ContextFloat` - has no scoreboard
equivalent at *all*, so there would be nothing to fall back to: Minecraft's scoreboard has
no floating point, and no way to roll a random number inside an expression. Anything that
*can* fall back is already `math`'s job. So reach for `ctx.compute()` only for what truly
requires 26.3+, and accept the hard version floor that comes with it.

It validates against the target's command tree and throws unconditionally if `/compute`
doesn't exist there:

```ts
compute().defaultFloat(provider, scale?)     // into the executing context's used objective
compute().entityFloat(target, provider, scale?)
compute().blockFloat(pos, provider, scale?)
compute().defaultInteger(provider)           // integer variants take no scale
compute().entityInteger(target, provider)
compute().blockInteger(pos, provider)
```

Pair it with `ctx.execute().storeResultScore(dest).run(b => b.compute()...)` to land the
result in a `Score`. Finishing the triangle from above needs a real square root - the one
thing `math` can't do, and the reason `/compute` exists:

```ts compile
import { Datapack, v26_3_rc_2, ScoreTarget, ContextFloat } from "helix";

const dp = new Datapack("pythagoras-compute-demo", v26_3_rc_2);
const stats = dp.objective("stats");
const legA = stats.score(ScoreTarget("a"));
const legB = stats.score(ScoreTarget("b"));
const hyp = stats.score(ScoreTarget("hyp")); // stored *100 for two decimal places

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  // hyp = sqrt(a^2 + b^2), scaled by 100 - `ContextFloat.length` IS `sqrt(Σ xᵢ²)` in
  // one node, so it's exactly the Pythagorean theorem for however many legs you give it.
  const hypotenuse = ContextFloat.length(ContextFloat.score(legA), ContextFloat.score(legB));
  ctx.execute().storeResultScore(hyp).run((b) => b.compute().defaultFloat(hypotenuse, 100));
});
```

`ContextFloat.length` takes any number of legs, so the same call is the 3D distance formula
with a third `ContextFloat.score(...)` argument - which is exactly what the ballistics
example below needs.

### A complex one: ballistic drop with a random spread

Combining `uniform`, `pow`, and a context score read into one command - the kind of formula
that would otherwise take half a dozen scratch-score operations:

```ts compile
import { Datapack, v26_3_rc_2, ScoreTarget, ContextFloat } from "helix";

const dp = new Datapack("ballistics-demo", v26_3_rc_2);
const shot = dp.objective("shot");
const dropOut = shot.score(ScoreTarget("drop")); // *1000, integer cells hold three decimals

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const t = ContextFloat.contextScore("this", "flight_time", 0); // ticks in flight
  const gravity = 0.05; // blocks/tick^2, vanilla arrow-ish drag approximation
  const spread = ContextFloat.uniform(-0.01, 0.01); // per-shot randomness, evaluated server-side

  // drop = (0.5 * g * t^2 + spread) * 1000
  const drop = ContextFloat.mul(
    ContextFloat.add(ContextFloat.mul(0.5, gravity, ContextFloat.pow(t, 2)), spread),
    1000,
  );
  ctx.execute().storeResultScore(dropOut).run((b) => b.compute().defaultFloat(drop));
});
```

## Choosing between them

| | `math` | `ctx.compute()` |
| --- | --- | --- |
| Works below 26.3 | Yes (lowers to operation chains) | No - throws unconditionally |
| Values | Integers only | Int and float, separately |
| Ops | `+ - * / % min max abs dot len2 vec` | Everything: `avg pow uniform conditional binomial` truncating `div`/`mod` `storage contextScore raw`, plus `ContextFloat`'s `sqrt sin cos ceil floor round truncate length` |
| Syntax | Infix template string | Fluent builder tree |

Write `math` unless you can't. It covers ordinary integer bookkeeping across scores and
vectors on every supported version, and on 26.3+ you get the single-command `/compute`
lowering for free without asking. Drop to `ctx.compute()` only for the things a scoreboard
has no answer for - floats, `sqrt`, trig, `uniform`, storage/context reads - knowing that
pins the pack to 26.3+.
