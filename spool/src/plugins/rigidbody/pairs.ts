// Body-body collisions: find nearby bodies, find contacts, solve them with the world contacts.
import { EntityType, Range, Selector, math } from "helix";
import type { FunctionContext } from "helix";
import { VERTICES, type RigidState } from "./state";
import { defineAxes, findContacts, ownBox } from "./sat";
import { prepareContact } from "./solve";
import { resolvePairPenetration } from "./passes";
import { halfExtents } from "./world";
import { wake } from "./body";
import type { RigidTuning } from "./tuning";

const SELF_TAG = "rb.self";

/**
 * Checks the executing body against every other body near enough to touch. Run as the body,
 * after its world contacts are solved, so both kinds of contact are solved together.
 */
export function collidePairs(s: RigidState, t: RigidTuning, ctx: FunctionContext): void {
  const self = Selector.self();
  // Cubes can touch while their centres are up to a diagonal apart, plus a tick of movement.
  const reach = t.maxSize * Math.sqrt(3) + 0.5;
  ctx.tag().add(self, SELF_TAG);
  ownBox(s).centre.assign(s.body.pos);
  ownBox(s).half.assign(s.body.half);
  ctx
    .execute()
    .at(Selector.self())
    .as(s.bodies().notTag(SELF_TAG).distance(Range.atMost(reach)))
    .run((b) => b.call(s.fn.pair));
  ctx.tag().remove(Selector.self(), SELF_TAG);
}

/**
 * Builds `rb/pair/check` (run as the other body) and `rb/pair/solve` (run back as this body).
 */
export function definePairs(s: RigidState, t: RigidTuning): void {
  const o = s.other;
  const hits = s.count("pair_hits");
  defineAxes(s, t);

  s.fn.pair.build((ctx) => {
    const { body } = s;
    o.pos.assign(body.pos);
    o.vel.assign(body.vel);
    o.spin.assign(body.spin);
    o.half.assign(body.half);
    o.invMass.assign(body.invMass);
    o.invInertia.assign(body.invInertia);
    o.sleeping.assign(body.sleeping);
    o.support.assign(body.support);
    o.wake.set(0);
    halfExtents(s, o.axes);
    hits.set(0);

    for (let j = 0; j < VERTICES; j++) {
      const mine = s.contact(VERTICES + j);
      const theirs = s.contact(2 * VERTICES + j);
      const [sx, sy, sz] = [j & 1, j & 2, j & 4].map((b) => (b ? 1 : -1));
      mine.hit.set(0);
      theirs.hit.set(0);
      mine.point.assign(s.contact(j).point);
      math`${o.pos} + ${sx} * ${o.axes[0]} + ${sy} * ${o.axes[1]} + ${sz} * ${o.axes[2]}`.into(theirs.point);
    }
    findContacts(s, ctx);

    ctx.if(hits.greaterThan(0), (b) => {
      const me = Selector.allEntities().type(EntityType.ITEM_DISPLAY).tag(SELF_TAG).limit(1);
      b.execute().as(me).run((d) => d.call(s.fn.pairSolve));
      body.pos.assign(o.pos, b);
      body.vel.assign(o.vel, b);
      body.spin.assign(o.spin, b);
      b.if(o.wake.equal(1), (d) => wake(s, d));
    });
  });

  s.fn.pairSolve.build((ctx) => {
    for (let i = VERTICES; i < 3 * VERTICES; i++) {
      ctx.if(s.contact(i).hit.equal(1), (b) => prepareContact(s, t, b, i));
    }
    s.count("pass").set(t.passes);
    ctx.call(s.fn.pairPass);
    resolvePairPenetration(s, t, ctx);
  });
}
