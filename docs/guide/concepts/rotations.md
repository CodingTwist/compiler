# Rotations

Display entities are how a datapack draws anything that isn't a block, and every one of
them carries its orientation as a **quaternion** - four numbers, `[x, y, z, w]`, that are
famously unpleasant to reason about.

The good news: you never have to. This page is mostly about *not* thinking in
quaternions. Read the first section and skip the rest until something looks wrong.

## Don't derive it. State the intent.

Almost every rotation you actually want is "this part of the model points **there** right
now, and I want it pointing **there** instead". That is
[`quatFromTo`](/api/helix/functions/quatFromTo), and it takes two directions - no axis to
pick, no angle to guess, no sign to get backwards.

```ts
import { quatFromTo } from "helix";

// A sword that hangs point-down, laid flat to point out front.
const flat = quatFromTo([0, -1, 0], [0, 0, 1]);
```

Neither vector has to be unit length - `[0, -3, 0]` says the same thing as `[0, -1, 0]`.
The directions are in the model's own space: `+X` east, `+Y` up, `+Z` the way the entity
faces at yaw 0.

That's the whole technique. Write down where it points, write down where you want it,
hand over both.

## What a quaternion actually is, in one paragraph

It is an **orientation**, not an angle: "turn by some amount about some axis", stored so
that it composes cleanly and has no gimbal lock. You need exactly three facts about it:

1. `[0, 0, 0, 1]` is *no rotation* - the identity you'll see all over emitted NBT.
2. They **compose** by multiplication, and order matters.
3. Minecraft interpolates between two of them along the **shortest path**. That is why a
   spin is a *sequence* of poses rather than one big angle - see the gotchas below.

## The three ways to make one

| | Use it when |
| --- | --- |
| `quatFromTo(from, to)` | You know where the model points and where you want it. **Start here.** |
| `quat(axis, degrees)` | You want a turn about `"x"`, `"y"` or `"z"` - a spin, a hinge, a step of an animation. |
| `mulQuat(a, b)` | You need two of them at once. |

The one thing about `mulQuat` that bites everyone: **`b` happens first.** It reads like
the maths (`a * b`), which means right-to-left, which is the opposite of the order you
say it out loud.

```ts
import { mulQuat, quat, rotateVec } from "helix";

// "Flip it over, then turn it a quarter" - the flip is the *right* operand.
const pose = mulQuat(quat("z", 90), quat("x", 180));
rotateVec([0, 1, 0], pose); // [1, 0, 0]
```

[`rotateVec`](/api/helix/functions/rotateVec) is the escape hatch for exactly this
situation: when you can't picture a pose, run a direction through it at build time and
print the result. It costs nothing - all of this is compile-time arithmetic that bakes
into the emitted NBT.

## Where they go on a display

A display's transform has **two** rotation slots, and they are not interchangeable.
The transform applies as `translation → leftRotation → scale → rightRotation → model`,
so reading in the order things happen to the model:

- **`rightRotation` orients the model in its own space** - it happens before the scale.
  This is where you correct for however the item or block model happens to be built: a
  2D item sprite lies in the XY plane with the item on its diagonal, so *something* has
  to turn it into the shape you meant.
- **`leftRotation` orients that result in the world** - the pose. This is the one an
  animation drives.

```ts compile
import { Datapack, v26_2, Display, Item, quat, quatFromTo, mulQuat } from "helix";

const dp = new Datapack("blade", v26_2);

dp.createFunction("summon").build((ctx) => {
  Display.item(
    Item.DIAMOND_SWORD,
    {
      // Fix the model: flip it, then bring the blade's diagonal down to vertical.
      rightRotation: mulQuat(quat("z", -45), quat("x", 180)),
      // Pose it: the blade now points [0,-1,0], so lay it out front.
      leftRotation: quatFromTo([0, -1, 0], [0, 0, 1]),
      scale: [1.4, 1.4, 1.4],
    },
    "none",
  )
    .brightness(15)
    .summon(ctx);
});
```

The `"none"` display context matters here: the `head`/`thirdperson` contexts bake in
their *own* rotation and offset, which fight whatever you set.

## Turning part of a group

Display entities have **no transform inheritance**. Every member of a multi-part model
carries a full absolute transform, so turning one member about a pivot is two separate
jobs:

- its **position** is the rotated offset -
  [`rotateAboutPivot(offset, pivot, q)`](/api/helix/functions/rotateAboutPivot);
- its **orientation** is the same `q` composed onto whatever it already holds -
  `mulQuat(q, itsLeftRotation)`.

Doing only the first makes a part slide around a circle while staying stubbornly upright.
Doing only the second spins it on the spot. twine's `Gesture` is the worked example: it
does both, every poll, for the members you name.

## Gotchas

**A rotation about the axis a model already lies on is invisible.** A sword hanging
point-down, spun about `y`, is a sword hanging point-down. If a pose "does nothing", check
this first - it is the most common cause by a distance, and it doesn't look like a bug,
it looks like the code never ran.

**Orbiting and turning are different things.** Rotating a part's *orientation* without
its *translation* keeps it in place while it turns; doing both carries it around a circle.
A blade that should sweep like a rotor needs its orientation laid flat (one constant
rotation) while a *separate* per-step rotation walks its translation around the circle -
which is exactly the split between `Gesture`'s `tilt` and its `rotate`.

**`quat("y", 405)` is not a full turn plus 45°.** It is the same orientation as
`quat("y", 45)`, and Minecraft will interpolate to it the short way. There is no such
thing as "more than one turn" in a single pose: express a spin as a **sequence** of poses,
each under 360° from the last, and let each one interpolate.

**Two poses that look adjacent may not interpolate adjacently.** The shortest path
between orientations is not always the one you pictured. If a step snaps backwards, add
an intermediate pose.

## See also

- [Resource-pack models](/guide/concepts/models) - the models you're orienting.
- [`quatFromTo`](/api/helix/functions/quatFromTo) ·
  [`quat`](/api/helix/functions/quat) ·
  [`mulQuat`](/api/helix/functions/mulQuat) ·
  [`rotateVec`](/api/helix/functions/rotateVec) ·
  [`rotateAboutPivot`](/api/helix/functions/rotateAboutPivot)
