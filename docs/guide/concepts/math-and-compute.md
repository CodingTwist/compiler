# Math and `/compute`

Minecraft 26.3 added `/compute` - one command that evaluates a whole arithmetic tree
server-side, with real floats and functions like `sqrt`. Below that version, the only way
to do arithmetic is a chain of `scoreboard players operation` commands over scratch
scores. helix gives you two ways in:

- **`` math`…` ``** - infix algebra over `Score`/`ScoreVec3`, and the one you should reach
  for. Write the formula once; helix lowers it to a single `/compute` on 26.3+ or the
  equivalent operation chain below it, whichever the target version needs. **All of the
  arithmetic lives here**, including the float ops - they just pin the pack to 26.3+.
- **`ctx.compute()`** with **`ContextInt`/`ContextFloat`** - the _leaves_ a formula can't
  spell (`uniform`, `storage`, `conditional`, `binomial`, `raw`) and the
  destinations a `Score` isn't (entity/block data). 26.3+ only, no exceptions.

The split isn't int-vs-float and it isn't two syntaxes for the same job: `math` owns every
operator, and `ContextInt`/`ContextFloat` supply values a formula can't name - which you
then interpolate into a formula as a `${}` hole. Read
[Scores](/guide/concepts/scores) and [Score vectors](/guide/concepts/score-vectors) first if
you haven't - both read and write ordinary `Score` cells.

## `math` - the formula syntax

```ts
math`-${dot} + min((${distSq} - ${ropeLenSq}) / ${BAUM_DIV}, ${BAUM_MAX})`.into(
  coef,
);
```

`${}` holes are ordinary TypeScript - a `Score`, a `ScoreVec3`, a number, another `math`
expression, or a `ContextInt`/`ContextFloat` provider - so autocomplete works as normal;
only the operators are text. Call `.into(dest)` to emit it; `dest` is a `Score` for a
scalar formula or a `ScoreVec3` for a vector one.

**Portable, every supported version:** `+ - * / %`, unary `-`, `min`, `max`, `abs`,
`dot`/`·`, `len2`, `vec`. Scores are integers - `/` floors toward `-∞` and `%` is
floor-modulo, matching `scoreboard players operation` (the side that can't change), so on
26.3+ it lowers to `floor_div`/`floor_mod`, not float division.

**26.3+ only:** `sqrt`, `sin`, `cos`, `pow`, `avg`, `round`, `floor`, `ceil`, `len`; any
**fractional literal** (`0.5`); and any `ContextInt`/`ContextFloat` provider dropped in as a
`${}` hole, which is how `uniform`, `storage` and `conditional` get into a
formula. None of these have a scoreboard lowering (a scoreboard has no real arithmetic and
no way to roll a number), so there is nothing to fall back to. They're in the language
anyway rather than hidden behind a second API: use one and your pack targets 26.3+, and a
lower target fails the **build** with the op and the version named, not the game.

```ts
// a whole formula, one command - the random draw is a leaf, not a second API
math`round(${ContextFloat.uniform(0, 1)} * ${spread}) + ${base}`.into(aim);
```

Those three things evaluate on `/compute`'s **float** side, and float-ness spreads up the
expression and is truncated **once**, at the destination. So `` math`sqrt(${x}) / 2` ``
really halves the root instead of flooring it first, and `/` is real division anywhere
inside a float expression - which makes a fractional literal the escape hatch from floor
division: `` math`${a} / 2` `` floors, `` math`${a} / 2.0` `` doesn't. Nothing changes for
an int-only formula: it renders exactly the same commands it always did.

One semantic catch worth knowing before you make a formula float: `%` is floor-modulo on
the integer side (matching the scoreboard, so `-5 % 2` is `1`) but **truncated** on the
float side, where the same expression gives `-1`. `/compute` has no float floor-modulo to
match it with.

```ts compile
import { Datapack, v26_3_rc_2, ScoreTarget, ScoreVec3, math } from "helix";

const dp = new Datapack("sqrt-demo", v26_3_rc_2);
const phys = dp.objective("phys");
const cell = (name) => phys.score(ScoreTarget(name));

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const vel = new ScoreVec3(cell("vx"), cell("vy"), cell("vz"));

  // speed = |vel|, to the nearest whole unit. One command on this target;
  // change v26_3_rc_2 to v26_2 above and the build fails instead of the pack.
  math`round(len(${vel}))`.into(cell("speed"), ctx);

  // …and *100, for two decimal places in an integer cell. The scaling happens
  // in floats, so it's the real length times 100 - not the truncated one.
  math`len(${vel}) * 100`.into(cell("speed_centi"), ctx);
});
```

`len(v)` is one `length` node (`sqrt(Σ xᵢ²)`), the same value as `sqrt(len2(v))` but
without the round trip. A float result landing in an integer cell **truncates toward 0** -
`len` of `(1,1,0)` lands as `1`, not `1.41` - so scale inside the formula for decimals, and
wrap in `round()` when you want nearest instead of down.

### Pythagorean theorem, and the AST underneath

`` math`…` `` doesn't run your formula directly - it parses the template into the
{@link ExprNode} tree from `frontend/nodes/expr.ts` (a plain `{ kind, op, args }` data
structure, no version or context attached), and it's _that_ tree the handler lowers, either
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

Every operator in the template becomes an `op` node, every `${}` hole a `score`/`lit`/
`provider` leaf - the same tree shape regardless of which backend ends up rendering it.
The lowering is where the version shows up: `toProvider` walks the tree into one
`/compute` argument (tracking which ops need the float side, and inserting
`from_int`/`from_float` only at those boundaries), `toScoreOps` walks the same tree into
an operation chain and refuses the ops that have no chain. Put to work, that's
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

  // hypSq = a^2 + b^2 - the theorem, minus the square root. Adding `sqrt(…)` here
  // would be a build error: this pack targets 26.2.
  math`${legA} * ${legA} + ${legB} * ${legB}`.into(hypSq, ctx);
});
```

Retarget the pack at 26.3 and the whole theorem is one formula - the `sqrt` wraps the
same `add` node, and the root is taken in floats before anything truncates:

```ts compile
import { Datapack, v26_3_rc_2, ScoreTarget, math } from "helix";

const dp = new Datapack("hypotenuse-demo", v26_3_rc_2);
const stats = dp.objective("stats");

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const legA = stats.score(ScoreTarget("a"));
  const legB = stats.score(ScoreTarget("b"));

  // hyp = sqrt(a^2 + b^2), truncated once on the way into the cell: legs 1 and 1
  // land as 1, not 2. (`len(${legA}, ${legB})` is the same value in one node.)
  math`sqrt(${legA} * ${legA} + ${legB} * ${legB})`.into(
    stats.score(ScoreTarget("hyp")),
    ctx,
  );

  // Three decimals: scale *inside* the sqrt's result, so it's the real root
  // times 1000 - the input to a `Fixed` cell at scale 1000.
  math`sqrt(${legA} * ${legA} + ${legB} * ${legB}) * 1000`.into(
    stats.score(ScoreTarget("hyp_milli")),
    ctx,
  );
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

## `ctx.compute()` - the leaves, and the other destinations

`/compute`'s expression language comes as two typed builders - `ContextInt` and
`ContextFloat`, kept apart because `sqrt`/`sin`/`cos`/`length` exist only on float and
`floor_div`/`floor_mod`/`binomial` only on int - that build a
`ContextIntProvider`/`ContextFloatProvider` tree.

You don't need them for **arithmetic** any more: `` math`…` `` covers every operator, in
both namespaces, and inserts the int↔float crossings for you. What's left is what a formula
can't spell:

- **Leaves** - `uniform` (a real roll, evaluated by the game), `storage`, `conditional`,
  `binomial`, and the `raw` escape hatch. Build one and interpolate it:
  `` math`${ContextFloat.uniform(0, 1)} * ${k}` ``. It's still one command.
- **Destinations other than a `Score`** - `entityFloat`, `blockFloat`, `blockInteger`
  write straight into entity or block data, where `.into()` only takes score cells. The
  arithmetic can still come from a formula: `math`…`.provider` /
  `math`…`.floatProvider` hands one over as a `/compute` argument.

There is deliberately no version-aware wrapper around any of it: a scoreboard has no
floating point and no way to roll a number, so there is nothing to fall back to.

`compute()` validates against the target's command tree and throws unconditionally if
`/compute` doesn't exist there:

```ts
compute().defaultFloat(provider, scale?)     // into the executing context's used objective
compute().entityFloat(target, provider, scale?)
compute().blockFloat(pos, provider, scale?)
compute().defaultInteger(provider)           // integer variants take no scale
compute().entityInteger(target, provider)
compute().blockInteger(pos, provider)
```

Finishing the triangle from above needs none of it - `len()` takes one `ScoreVec3` or any
number of scalar legs, so the hypotenuse is one line:

```ts
math`len(${legA}, ${legB}) * 100`.into(hyp); // *100 for two decimal places
```

What you do need `ctx.compute()` for is the **destination**. `.into()` writes score cells;
to land a formula in entity or block data, hand the formula over as a provider with
`.provider` (integer) or `.floatProvider` (float) instead of rebuilding it by hand:

```ts compile
import {
  Datapack,
  v26_3_rc_2,
  ScoreTarget,
  ScoreVec3,
  Selector,
  math,
} from "helix";

const dp = new Datapack("compute-dest-demo", v26_3_rc_2);
const phys = dp.objective("phys");
const cell = (name) => phys.score(ScoreTarget(name));

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const vel = new ScoreVec3(cell("vx"), cell("vy"), cell("vz"));

  // Write |vel| * 0.05 straight onto the entity - a float destination, so the
  // formula stays on the float side all the way in: no truncation at all.
  ctx
    .compute()
    .entityFloat(Selector.self(), math`len(${vel}) * 0.05`.floatProvider);
});
```

Both getters are scalar-only (a vector formula is three expressions, not one) and 26.3+ by
construction - there is no `/compute` below it to hand them to.

`ctx.execute().storeResultScore(dest).run(b => b.compute()...)` is the other half: it lands
a provider in a `Score`, which is the long way round to `.into()` and worth seeing once,
because it's the machinery under every `math` formula.

### A complex one: ballistic drop with a random spread

The mixed style, and the one to copy: the one thing a formula can't name comes from
`ContextFloat`, every operator comes from `math`, and the whole thing is one command - the
kind of expression that would otherwise take half a dozen scratch-score operations.

```ts compile
import {
  Datapack,
  v26_3_rc_2,
  ScoreTarget,
  Selector,
  ContextFloat,
  math,
} from "helix";

const dp = new Datapack("ballistics-demo", v26_3_rc_2);
const shot = dp.objective("shot");
const dropOut = shot.score(ScoreTarget("drop")); // *1000, integer cells hold three decimals

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const t = shot.score(Selector.self()); // ticks in flight, on the projectile itself
  const gravity = 0.05; // blocks/tick^2, vanilla arrow-ish drag approximation
  const spread = ContextFloat.uniform(-0.01, 0.01); // per-shot randomness, rolled by the game

  // drop = (0.5 * g * t^2 + spread) * 1000
  math`(0.5 * ${gravity} * pow(${t}, 2) + ${spread}) * 1000`.into(dropOut, ctx);
});
```

The `*1000` is inside the formula, so the scaling happens in floats and only the final
value truncates - the same thing `defaultFloat(provider, 1000)` does, without leaving the
formula. Note the fractional literals: a plain `0.05` is a float constant, and writing one
is itself enough to move the formula onto the float side - the `uniform` leaf here would
have done it anyway. On an integer-only target, a coefficient is the fixed-point convention
instead: `` math`${a} * 500 / 1000` `` for `a * 0.5`.

## Choosing between them

|                  | `math`                                                                                              | `ContextInt`/`ContextFloat` + `ctx.compute()`                             |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Works below 26.3 | The portable ops, yes; the 26.3+ ops throw at build time                                            | No - throws unconditionally                                               |
| Values           | Int, crossing to float where an op or a literal needs it                                            | Int and float, as separate namespaces                                     |
| Ops              | All of them: `+ - * / % min max abs dot len2 vec`, then `sqrt sin cos pow avg round floor ceil len` | The same ops, plus the leaves: `uniform storage conditional binomial raw` |
| Destination      | a `Score` / `ScoreVec3` via `.into()`, or any store target via `.provider` / `.floatProvider`       | any store target - scores, entity data, block data                        |
| Syntax           | Infix template string                                                                               | Fluent builder tree                                                       |

Write `math`. It covers the arithmetic - all of it - and builds the one `/compute` command
on 26.3+ or the operation chain below, without being asked. Reach for
`ContextInt`/`ContextFloat` when you need a value a formula can't name (a random roll, a
storage read, a predicate branch) and drop it into a formula as a hole. What pins a pack to
26.3+ is using any of that: a float op, a fractional literal, or a provider leaf.
