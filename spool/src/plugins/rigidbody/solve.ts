// Contact response: accumulated velocity impulses with friction, then pushing out of blocks.
import { math } from "helix";
import type { FunctionContext } from "helix";
import { SPIN_PER_TORQUE, VERTICES, W, type RigidState } from "./state";
import type { RigidTuning } from "./tuning";

/**
 * Readies a fresh contact for solving: lever arm, effective mass along the normal, bounce
 * target, and zeroed accumulated impulses. Run as the body, right after the contact is found.
 *
 * A cube's inertia is the same about every axis, so the effective mass along a direction d is
 * `invMass + invInertia·|r×d|²` - no contact-frame matrices needed.
 */
export function prepareContact(s: RigidState, t: RigidTuning, ctx: FunctionContext, i: number): void {
  const c = s.contact(i);
  const { pos, vel, spin, invMass: im, invInertia: ii } = s.body;
  const vn = s.scalar("vn");
  const rn = s.vector("rn");
  math`${c.point} - ${pos}`.into(c.r);
  math`(${vel} + cross(${spin} * ${1 / W}, ${c.r})) · ${c.normal} / 1000`.into(vn);
  math`cross(${c.r}, ${c.normal}) / 1000`.into(rn);
  math`${im} + ${ii} * len2(${rn}) * 0.000001`.into(c.kn);
  // Bounce only on real impacts, so resting contacts don't jitter.
  c.target.set(0);
  ctx.if(vn.lessThan(-t.bounceBelow), () => math`-${vn} * ${t.restitution} / 1000`.into(c.target));
  c.acc.set(0);
  c.friction.components.forEach((f) => f.set(0));
}

/**
 * Builds `rb/contact/solve_<i>`: one sequential-impulse step for contact `i`.
 *
 * The normal impulse accumulates and is clamped at zero (contacts push, never pull), and
 * friction accumulates and is clamped to μ·that, so repeated passes converge on the answer
 * where all contacts share the load instead of the first one taking it all.
 */
export function defineSolve(s: RigidState, t: RigidTuning, i: number): void {
  const c = s.contact(i);
  const { vel, spin, invMass: im, invInertia: ii } = s.body;
  s.fn.contacts[i].solve.build((ctx) => {
    const vp = s.vector("vp");
    const vn = s.scalar("vn");
    const old = s.scalar("acc_old");
    const J = s.vector("J");
    math`${vel} + cross(${spin} * ${1 / W}, ${c.r})`.into(vp);
    math`${vp} · ${c.normal} / 1000`.into(vn);

    // Normal: λ = max(λ + (target − vn)/K, 0), applying only the change.
    old.assign(c.acc);
    math`max(${c.acc} + (${c.target} - ${vn}) * 1000 / ${c.kn}, 0)`.into(c.acc);

    // Friction: push the sliding velocity to zero, keeping |F| ≤ μ·λ.
    const vt = s.vector("vt");
    const tl = s.scalar("vt_len");
    const prev = s.vector("f_old");
    prev.assign(c.friction);
    math`${vp} - ${c.normal} * ${vn} / 1000`.into(vt);
    math`len(${vt})`.into(tl);
    ctx.if(tl.greaterThan(0), () => {
      const rt = s.vector("rt");
      math`cross(${c.r}, ${vt}) / ${tl}`.into(rt);
      math`${c.friction} - ${vt} * 1000 / (${im} + ${ii} * len2(${rt}) * 0.000001)`.into(c.friction);
    });
    const cap = s.scalar("f_cap");
    const fl = s.scalar("f_len");
    math`${c.acc} * ${t.friction} / 1000`.into(cap);
    math`len(${c.friction})`.into(fl);
    ctx.if(fl.greaterThan(cap), () => math`${c.friction} * ${cap} / ${fl}`.into(c.friction));

    math`${c.normal} * (${c.acc} - ${old}) / 1000 + ${c.friction} - ${prev}`.into(J);
    math`${vel} + ${J} * ${im} / 1000`.into(vel);
    math`${spin} + cross(${c.r}, ${J}) * ${SPIN_PER_TORQUE} * ${ii}`.into(spin);
    math`len2(${J})`.into(s.scalar("j_sq"));
    ctx.if(s.scalar("j_sq").greaterThan(4), () => s.scalar("applied").set(1));
  });
}

/**
 * Builds `rb/solve/pass`: one sweep over the hit contacts, repeated while impulses still change.
 * Run as the body with `#pass` counting down.
 */
export function definePass(s: RigidState): void {
  const applied = s.scalar("applied");
  const pass = s.scalar("pass");
  s.fn.solvePass.build((ctx) => {
    applied.set(0);
    for (let i = 0; i < VERTICES; i++) {
      const c = s.contact(i);
      ctx.if(c.hit.equal(1), (b) => b.call(s.fn.contacts[i].solve));
    }
    pass.remove(1);
    ctx.if(applied.equal(1), (b) =>
      b.if(pass.greaterThan(0), (d) => d.call(s.fn.solvePass)),
    );
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
