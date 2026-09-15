// Points fixed to a body, and rope-like springs pulling on them.
import { math } from "helix";
import type { FunctionContext, Score, ScoreVec3 } from "helix";
import { type RigidState } from "./state";
import { halfExtents } from "./world";

/** A spot on a body in half edges from its centre: [0, 1, 0] is the middle of its top face. */
export type LocalPoint = readonly [number, number, number];

/** Writes where `local` on the executing body is in the world. */
export function pointOnBody(s: RigidState, ctx: FunctionContext, local: LocalPoint, into: ScoreVec3): void {
  const h = [0, 1, 2].map((k) => s.vector(`h${k}`));
  halfExtents(s, h);
  const [x, y, z] = local;
  math`${s.body.pos} + ${x} * ${h[0]} + ${y} * ${h[1]} + ${z} * ${h[2]}`.into(into, ctx);
}

/** Fastest the rope reels in its stretch (blocks/tick), so a sudden long stretch can't fling the body. */
const MAX_TAKE_UP = 0.1;

/** What {@link spring} pulls with. */
export interface SpringOptions {
  /** The fixed end. */
  readonly anchor: ScoreVec3;
  /** Length below which it goes slack, like a rope. */
  readonly rest: Score;
  /** Share of the stretch taken back each tick. */
  readonly stiffness: number;
  /** Where it attaches to the body. */
  readonly attach: LocalPoint;
}

/**
 * Stops the executing body's attach point moving further than `rest` from the anchor, like a
 * rope. It cancels the outward speed the point will have next tick, gravity included, rather
 * than pulling with a force, so the body swings instead of bouncing on the end.
 */
export function spring(
  s: RigidState,
  gravity: number,
  ctx: FunctionContext,
  o: SpringOptions,
  input: { point: ScoreVec3; impulse: ScoreVec3 },
): void {
  const { pos, vel, spin, invMass: im, invInertia: ii } = s.body;
  const d = s.vector("spring_d");
  const len = s.scalar("spring_len");
  pointOnBody(s, ctx, o.attach, input.point);
  math`${input.point} - ${o.anchor}`.into(d, ctx);
  math`len(${d})`.into(len, ctx);
  ctx.if(len.greaterThan(o.rest), (b) => {
    const r = s.vector("spring_r");
    const arm = s.vector("spring_arm");
    const out = s.scalar("spring_out");
    math`${input.point} - ${pos}`.into(r, b);
    math`(${vel} - vec(0, ${gravity}, 0) + cross(${spin}, ${r})) · ${d} / ${len} + min((${len} - ${o.rest}) * ${o.stiffness}, ${MAX_TAKE_UP})`.into(out, b);
    b.if(out.greaterThan(0), (c) => {
      // Same effective mass as a contact: a cube's inertia is equal about every axis.
      math`cross(${r}, ${d}) / ${len}`.into(arm, c);
      math`-${d} * (${out} / (${len} * (${im} + ${ii} * len2(${arm}))))`.into(input.impulse, c);
      c.call(s.fn.impulse);
    });
  });
}
