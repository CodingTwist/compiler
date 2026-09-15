// Contact response: accumulated velocity impulses with friction, for world and body-body slots.
import { and, math } from "helix";
import type { FunctionContext, MathExpr, Score, ScoreVec3 } from "helix";
import { isPaired, type RigidState } from "./state";
import type { RigidTuning } from "./tuning";

type Contact = ReturnType<RigidState["contact"]>;

/** Velocity of the contact point on this body, relative to the other body's for a paired slot. */
function relativeVelocity(s: RigidState, c: Contact, paired: boolean): MathExpr {
  const own = math`${s.body.vel} + cross(${s.body.spin}, ${c.r})`;
  if (!paired) return own;
  const { vel, spin } = s.other;
  return math`${own} - (${vel} + cross(${spin}, ${c.ro}))`;
}

/**
 * Inverse effective mass of the contact along `dir`, where `dir / len` is a unit vector.
 *
 * A cube's inertia is the same about every axis, so this is `invMass + invInertia·|r×d|²` for
 * each body - no contact-frame matrices needed.
 */
function inverseMass(s: RigidState, c: Contact, dir: ScoreVec3, len: Score | number, paired: boolean): MathExpr {
  const arm = s.vector("arm");
  const { invMass: im, invInertia: ii } = s.body;
  math`cross(${c.r}, ${dir}) / ${len}`.into(arm);
  const own = math`${im} + ${ii} * len2(${arm})`;
  if (!paired) return own;
  const oarm = s.vector("oarm");
  math`cross(${c.ro}, ${dir}) / ${len}`.into(oarm);
  return math`${own} + ${c.oim} + ${c.oii} * len2(${oarm})`;
}

/**
 * Readies a fresh contact for solving: lever arms, effective mass along the normal, bounce
 * target, and zeroed accumulated impulses. Run as the body, once the contact is found.
 */
export function prepareContact(s: RigidState, t: RigidTuning, ctx: FunctionContext, i: number): void {
  const c = s.contact(i);
  const paired = isPaired(i);
  const o = s.other;
  const vn = s.scalar("vn");
  math`${c.point} - ${s.body.pos}`.into(c.r);
  if (paired) math`${c.point} - ${o.pos}`.into(c.ro);
  math`${relativeVelocity(s, c, paired)} · ${c.normal}`.into(vn);

  if (paired) {
    const upward = c.normal.y.greaterThan(0.5);
    c.oim.assign(o.invMass);
    c.oii.assign(o.invInertia);
    // Resting on a grounded or sleeping body treats it as ground, or stacks sink and jitter.
    for (const ground of [o.sleeping.equal(1), and(o.support.atLeast(3), upward)]) {
      ctx.if(ground, () => {
        c.oim.set(0);
        c.oii.set(0);
      });
    }
    ctx.if(and(o.sleeping.equal(1), vn.lessThan(-t.bounceBelow)), () => {
      c.oim.assign(o.invMass);
      c.oii.assign(o.invInertia);
      o.wake.set(1);
    });
    ctx.if(upward, () => s.count("hits").add(1));
  }
  inverseMass(s, c, c.normal, 1, paired).into(c.kn);

  // Bounce only on real impacts, so resting contacts don't jitter.
  c.target.set(0);
  ctx.if(vn.lessThan(-t.bounceBelow), () => math`-${vn} * ${t.restitution}`.into(c.target));
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
  const paired = isPaired(i);
  const { vel, spin, invMass: im, invInertia: ii } = s.body;
  s.fn.solve[i].build((ctx) => {
    const vp = s.vector("vp");
    const vn = s.scalar("vn");
    const old = s.scalar("acc_old");
    const J = s.vector("J");
    relativeVelocity(s, c, paired).into(vp);
    math`${vp} · ${c.normal}`.into(vn);

    // Normal: λ = max(λ + (target − vn)/K, 0), applying only the change.
    old.assign(c.acc);
    math`max(${c.acc} + (${c.target} - ${vn}) / ${c.kn}, 0)`.into(c.acc);

    // Friction: push the sliding velocity to zero, keeping |F| ≤ μ·λ.
    const vt = s.vector("vt");
    const tl = s.scalar("vt_len");
    const prev = s.vector("f_old");
    prev.assign(c.friction);
    math`${vp} - ${c.normal} * ${vn}`.into(vt);
    math`len(${vt})`.into(tl);
    ctx.if(tl.greaterThan(0), () => {
      math`${c.friction} - ${vt} / (${inverseMass(s, c, vt, tl, paired)})`.into(c.friction);
    });
    const cap = s.scalar("f_cap");
    const fl = s.scalar("f_len");
    math`${c.acc} * ${t.friction}`.into(cap);
    math`len(${c.friction})`.into(fl);
    ctx.if(fl.greaterThan(cap), () => math`${c.friction} * ${cap} / ${fl}`.into(c.friction));

    math`${c.normal} * (${c.acc} - ${old}) + ${c.friction} - ${prev}`.into(J);
    math`${vel} + ${J} * ${im}`.into(vel);
    math`${spin} + cross(${c.r}, ${J}) * ${ii}`.into(spin);
    if (paired) {
      const o = s.other;
      math`${o.vel} - ${J} * ${c.oim}`.into(o.vel);
      math`${o.spin} - cross(${c.ro}, ${J}) * ${c.oii}`.into(o.spin);
    }
    // Converged once no impulse moves more than 2 mm/tick.
    const moved = s.scalar("j_sq", 1e6);
    math`len2(${J})`.into(moved);
    ctx.if(moved.greaterThan(0.000004), () => s.count("applied").set(1));
  });
}
