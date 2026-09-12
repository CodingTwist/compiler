# Score vectors

Runtime vector math on the scoreboard is repetitive: every operation is three near-
identical `scoreboard players operation` lines, one per axis. [`ScoreVec3`](/api/helix/classes/ScoreVec3)
collapses that - it holds **three [`Score`](/api/helix/classes/Score) cells** as one
vector and exposes vector algebra that reads like algebra.

Read [Scores](/guide/concepts/scores) first; every `ScoreVec3` method just fans out to
the corresponding `Score` op on each axis.

## It owns nothing

A `ScoreVec3` is a *reference* to three existing score cells - it allocates nothing, and
**you** decide where each component lives. That's deliberate: one class serves both roles
a score-vector plays.

- A **value** - three per-entity objectives bound to a selector (a stored position, a
  velocity carried on the mob).
- A **scratch register** - three cells on a work objective, reused each tick.

```ts
const motion = dp.objective("motion");
const vec = (p) => new ScoreVec3(
  motion.score(ScoreTarget(p + "x")),
  motion.score(ScoreTarget(p + "y")),
  motion.score(ScoreTarget(p + "z")),
);
```

## Component-wise algebra

`assign` / `add` / `sub` / `scale` / `divide` / `clamp` each apply to all three axes and
return `this`, so they chain - `v.assign(a).sub(b).scale(k)`. Every method takes the same
optional trailing `ctx` as `Score` (ambient by default; pass it to be explicit).

```ts compile
import { Datapack, v26_2, ScoreTarget, ScoreVec3 } from "helix";

const dp = new Datapack("physics", v26_2);
const motion = dp.objective("motion");
const vec = (p) => new ScoreVec3(
  motion.score(ScoreTarget(p + "x")),
  motion.score(ScoreTarget(p + "y")),
  motion.score(ScoreTarget(p + "z")),
);

const step = dp.createFunction("step");
step.build((ctx) => {
  const pos = vec("p");
  const vel = vec("v");
  pos.add(vel, ctx);   // pos += vel, one line becomes three
});
```

One `pos.add(vel, ctx)` expands to the three `scoreboard players operation` lines above -
that's the whole point.

These methods are **mutations**, applied one after another: `v.assign(a).sub(b).scale(k)`
emits each step as its own commands. For a multi-term *formula* over vectors, write it as
one expression with `` math`…` `` instead - it takes `ScoreVec3` holes directly, broadcasts
per axis, and lowers the whole thing to a single `/compute` on 26.3+. See
[Math and `/compute`](/guide/concepts/math-and-compute).

## Dot products and length

`dot` and `lengthSquared` collapse a vector to a scalar. Both take a caller-owned `out`
cell (distinct from the vector's own components) and return it:

```
out = x·o.x + y·o.y + z·o.z        v.dot(o, out, ctx)
|v|² = v·v                          v.lengthSquared(out, ctx)
```

Unlike the component-wise methods, these two aren't a fan-out of per-axis commands - they
emit **one expression**, which becomes a single `/compute` on 26.3+ and the equivalent
operation chain below it. The cross terms go in an internal temp, so you don't hand over a
scratch cell for them. See [Math and `/compute`](/guide/concepts/math-and-compute).

It's *squared* length because integer scoreboards have no square root - and that's usually
where to stay, comparing squared distances against squared thresholds. If you do need the
real length and target 26.3+, `` math`len(${v})`.into(out) `` is one command (scale inside
the formula - `` math`len(${v}) * 100` `` - to keep decimals in an integer cell).

## Integer-only, floors toward −∞

Scores are integers, so `divide` and `scale` are integer ops - `divide` floors toward
−∞, not toward zero. When you need fractional precision (a unit direction, a normalised
velocity), build the vector out of [`Fixed`](/api/helix/classes/Fixed)-backed cells and
scale before you divide. `ScoreVec3` is the plumbing; the numeric strategy is yours.
