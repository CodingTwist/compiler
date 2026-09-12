# Fixed-point numbers

Scoreboards are integer-only, so fractions have to be carried by hand as `realValue ×
scale` - and every multiply squares the scale while every divide floors the fraction away.
[`Fixed`](/api/helix/classes/Fixed) makes that bookkeeping part of the type and the method
names, instead of a comment you have to keep in your head. It sits on top of the same
[`Score`](/guide/concepts/scores) primitive - read that page first.

## The scale, and the optional scale score

A `Fixed` wraps one `Score` and a `scale` number (the factor, e.g. `1000` for three decimal
places). Two of its operations - `mul` and `divide` - need to multiply/divide *by the scale
itself*, and a `scoreboard players operation` operand must be a score, not a literal. So
`Fixed` takes an optional third argument: a `scaleScore` slot you seed once at load.

```ts
const work = dp.objective("work");
const scaleScore = work.score(ScoreTarget("#scale"));
const x = new Fixed(work.score(ScoreTarget("x")), 1000, scaleScore);
// at load: ctx.scoreSet(scaleScore.set(1000));
```

It's a **hint, not a requirement**. Omit it and the arithmetic is identical - one command
longer on ≤26.2 (a `set <temp> 1000` before the multiply) and byte-for-byte the same on
26.3+, where the whole formula compiles to a single `/compute` and literals are free. The
same goes for `negate`'s `-1` slot. Operations that don't touch the scale (`assign`, `add`,
`sub`, `clamp`, and the unitless `gain`/`reduce`) never look at it.

## The operations, and what they do to the scale

| Method | Meaning | Scale |
| --- | --- | --- |
| `.assign` / `.add` / `.sub` | same-scale copy / `+=` / `-=` | unchanged |
| `.mul(other)` | fixed-point multiply | rebalanced (`*= other; /= scale`) |
| `.divide(divisor)` | **precision-preserving** divide | rebalanced (`*= scale; /= divisor`) |
| `.gain(k)` / `.reduce(k)` | multiply / divide by a *unitless* factor | unchanged |
| `.negate(negOne?)` | `*= -1` | unchanged |
| `.clamp(lo, hi)` | clamp into `[lo, hi]` | unchanged |

`.divide` is the one that earns its keep: it pre-multiplies by the scale so a small
numerator over a large divisor keeps `scale` fractional bits instead of truncating to zero
- the classic "the value silently vanished" scoreboard bug, defused.

```ts compile
import { Datapack, v26_2, ScoreTarget, Fixed } from "helix";

const dp = new Datapack("physics", v26_2);
const work = dp.objective("work");
const scaleScore = work.score(ScoreTarget("#scale"));

const setup = dp.createFunction("setup");
setup.build((ctx) => {
  scaleScore.set(1000, ctx);   // seed the scale slot once
});

const tick = dp.createFunction("tick");
tick.build((ctx) => {
  const dist = new Fixed(work.score(ScoreTarget("dist")), 1000, scaleScore);
  const time = new Fixed(work.score(ScoreTarget("time")), 1000, scaleScore);

  // speed = dist / time, keeping three decimals of precision.
  dist.divide(time, ctx);
});
```

## Going further

Like `Score` and [`ScoreVec3`](/guide/concepts/score-vectors), a `Fixed` holds a *reference*
and allocates nothing, emits into the ambient context (pass `ctx` to be explicit), and
chains by returning `this`. For fractional *vectors*, back each `ScoreVec3` component with a
`Fixed`-scaled cell and scale before you divide.

On 26.3+, a `math` formula can use real floats (`sqrt`, `len`, `sin`, `pow`, …) - which is
*not* a replacement for `Fixed`. That precision is **transient**: it lives inside the one
`/compute` command and the result still truncates into an integer cell on the way out. A
score is an integer on every version. So keep using `Fixed` for a fraction you **store**
across ticks, and use the float ops for precision you need *within* one formula - the two
compose, since a `Fixed`'s cell is an ordinary `Score` hole.

Every scale-rebalancing method here is itself written as one `` math`…` `` expression -
that's why `mul` and `divide` are a single `/compute` on 26.3+ rather than the two-command
rebalance the table describes. See [Math and `/compute`](/guide/concepts/math-and-compute)
for the expression syntax - including the real float math `Fixed` deliberately doesn't fake
(`sqrt`, `len`, trig, rounding - available in a formula, 26.3+ only).
