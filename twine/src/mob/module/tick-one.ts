import { NbtPath, Pos, Range, Relation, Selector, privateName } from "helix";
import type { FunctionContext } from "helix";
import type { ModuleScope } from "../../core/module.interface";
import { triggers } from "./gestures";
import type { MobParts } from "./parts";
import type { Relay } from "./types";

/** The yaw half of `Rotation` - index 1 is the pitch, which a rig must not copy. */
const YAW = NbtPath("Rotation[0]");

/** `<mob>/tick_one`: everything one awake mob does per poll, as it, at it. */
export function tickOneBody<S extends string>(m: MobParts<S>, ctx: FunctionContext, scope: ModuleScope): void {
  // Yours first: it decides what the gestures' triggers and the yaw copy then see.
  if (m.def.tick) ctx.call(m.fnRef("on_tick"));
  // Then the state, if any: one check for a mob in none.
  if (m.def.states.size) {
    ctx
      .execute()
      .ifScoreMatches(m.stateObj.score(Selector.self()), Range.atLeast(1))
      .run((b) => b.call(m.fnRef("state")));
  }
  for (const g of m.def.gestures) {
    // The fall is emitted before the trigger, or a gesture started this tick would end immediately.
    if (!g.sequenced) {
      m.poseMembers(ctx, Selector.self().tag(m.gestureTag(g)), g, undefined, g.fall);
      ctx.tag().remove(Selector.self().tag(m.gestureTag(g)), m.gestureTag(g));
    }
    if (g.cooldown !== 0) {
      ctx
        .execute()
        .ifScoreMatches(m.cooldown(g), Range.atLeast(1))
        .run((b) => b.call(m.fnRef(`${g.name}_clock`)));
    }
  }
  triggers(m, ctx);
  face(m, ctx, scope);
  if (m.def.relay) relayHits(m, ctx, m.def.relay);
}

/** Points the rig the way this mob is facing. Yaw only: copying pitch would tilt the whole model. */
function face<S extends string>(m: MobParts<S>, ctx: FunctionContext, scope: ModuleScope): void {
  const faceOne = scope.fn(privateName(`${m.name}/face_one`), (c) => {
    // Passengers keep their own rotation, so every member must be turned, not just the root.
    if (m.faceByRotate) {
      // Facing a point straight ahead copies the yaw without reading NBT.
      const turn = (b: FunctionContext) => b.rotate().facing(Selector.self(), Pos.local(0, 0, 1));
      turn(c);
      c.execute().on(Relation.PASSENGERS).run(turn);
      return;
    }
    // Older versions copy Rotation[0] through NBT. The rig tags itself so it's still
    // findable after `on vehicle` switches `@s`.
    const cur = `${m.name}.cur`;
    const me = m.rigRoots.tag(cur).limit(1);
    c.tag().add(Selector.self(), cur);
    c.execute()
      .on(Relation.VEHICLE)
      .run((b) => b.entity(me).set(YAW, b.entity(Selector.self()).at(YAW)));
    c.execute()
      .on(Relation.PASSENGERS)
      .run((b) => b.entity(Selector.self()).set(YAW, b.entity(me).at(YAW)));
    c.tag().remove(Selector.self(), cur);
  });
  if (!m.faceByRotate) m.dp.allowNbtRead(faceOne, "rig yaw copy, awake mobs only");

  const chain = ctx.execute();
  if (m.faceByRotate) chain.rotated(Pos.rel(0, Pos.abs(0)));
  chain.on(Relation.PASSENGERS).ifEntity(Selector.self().tag(`${m.rig}_0`));
  if (m.faceByRotate) chain.positionedAs(Selector.self());
  chain.run((b) => b.call(faceOne));
}

/** Turns a hit on the interaction hitbox into damage on this mob. `on attacker` finds the hitter without reading NBT. */
function relayHits<S extends string>(m: MobParts<S>, ctx: FunctionContext, relay: Relay): void {
  const attacked = m.internal("attacked", (c) => c.execute().on(Relation.ATTACKER).run((b) => b.return_(1)));
  const hit = m.internal("relay_hit", (c) => {
    c.execute()
      .on(Relation.VEHICLE)
      .on(Relation.VEHICLE)
      .run((b) => b.damage(Selector.self(), relay.damage, relay.type));
    // ponytail: one relayed hit per poll - the record only keeps the last one.
    c.entity(Selector.self()).remove(NbtPath("attack"));
  });
  ctx
    .execute()
    .on(Relation.PASSENGERS)
    .on(Relation.PASSENGERS)
    .ifEntity(Selector.self().tag(`${m.rig}_hitbox`))
    .ifFunction(attacked)
    .run((b) => b.call(hit));
}
