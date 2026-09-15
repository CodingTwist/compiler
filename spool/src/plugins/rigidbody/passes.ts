// Solver passes over the contact slots, and pushing bodies back out of what they sank into.
import { math } from "helix";
import type { FunctionContext, FunctionRef } from "helix";
import { VERTICES, type RigidState } from "./state";
import type { RigidTuning } from "./tuning";

/**
 * Builds `fn`: one sweep over the hit contacts in slots `0..slots`, repeated while impulses
 * still change. Run as the body with `#pass` counting down.
 */
export function definePass(s: RigidState, fn: FunctionRef, slots: number): void {
  const applied = s.scalar("applied");
  const pass = s.scalar("pass");
  fn.build((ctx) => {
    applied.set(0);
    for (let i = 0; i < slots; i++) {
      ctx.if(s.contact(i).hit.equal(1), (b) => b.call(s.fn.solve[i]));
    }
    pass.remove(1);
    ctx.if(applied.equal(1), (b) => b.if(pass.greaterThan(0), (d) => d.call(fn)));
  });
}

/**
 * Pushes the executing body out of the blocks it sank into.
 *
 * World normals are axis-aligned, so the push is the deepest contact per axis and sign;
 * pushing contact by contact would overshoot when four corners share a face.
 */
export function resolvePenetration(s: RigidState, t: RigidTuning, ctx: FunctionContext): void {
  const up = s.vector("push_pos");
  const down = s.vector("push_neg");
  up.components.forEach((sc) => sc.set(0));
  down.components.forEach((sc) => sc.set(0));
  for (let i = 0; i < VERTICES; i++) {
    const c = s.contact(i);
    ctx.if(c.hit.equal(1), (b) =>
      c.normal.components.forEach((n, axis) => {
        const [u, d] = [up.components[axis], down.components[axis]];
        b.if(n.greaterThan(0), () => math`max(${u}, ${c.depth})`.into(u));
        b.if(n.lessThan(0), () => math`max(${d}, ${c.depth})`.into(d));
      }),
    );
  }
  math`${s.body.pos} + max(${up} - ${t.slop}, 0) - max(${down} - ${t.slop}, 0)`.into(s.body.pos);
}

/**
 * Pushes this body and the other apart along the deepest body-body contact, split by inverse
 * mass. Only the deepest, for the same overshoot reason as {@link resolvePenetration}.
 */
export function resolvePairPenetration(s: RigidState, t: RigidTuning, ctx: FunctionContext): void {
  const depth = s.scalar("pp_d");
  const n = s.vector("pp_n");
  const oim = s.scalar("pp_oim");
  depth.set(t.slop);
  for (let i = VERTICES; i < VERTICES * 3; i++) {
    const c = s.contact(i);
    ctx.if(c.hit.equal(1), (b) =>
      b.if(c.depth.greaterThan(depth), () => {
        depth.assign(c.depth);
        n.assign(c.normal);
        oim.assign(c.oim);
      }),
    );
  }
  const { pos, invMass: im } = s.body;
  ctx.if(depth.greaterThan(t.slop), () => {
    // Left unstored: an int would truncate the share to zero before it's scaled back up.
    const push = math`${n} * (${depth} - ${t.slop}) * 0.001 / (${im} + ${oim})`;
    math`${pos} + ${push} * ${im}`.into(pos);
    math`${s.other.pos} - ${push} * ${oim}`.into(s.other.pos);
  });
}
