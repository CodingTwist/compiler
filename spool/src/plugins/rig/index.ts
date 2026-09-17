/**
 * The `rig` plugin: a `Display` model riding an entity, kept facing its way and cleaned up when it dies.
 *
 *   const r = rig(dp.group("sentinel"), { name: "sentinel", model });
 *   r.summonOn(ctx, () => Selector.allEntities().tag("fresh").limit(1));  // at the vehicle
 *   // each poll, as the vehicle:
 *   r.face(ctx);
 *   r.relayHits(ctx, { damage: 4 });
 *   // once a second: markOrphans, then claim as each live vehicle, then sweep
 *
 * Every member keeps its own rotation and a killed vehicle only dismounts its riders, which is
 * why facing and cleanup need commands at all.
 */
import { NbtPath, Pos, Range, Relation, Selector, atLeast, displayPose } from "helix";
import type { Datapack, FunctionContext, FunctionRef } from "helix";
import type { Rig, RigFn, RigOptions } from "./types";

export type { Relay, Rig, RigFn, RigOptions } from "./types";

/** The yaw half of `Rotation` - index 1 is the pitch. */
const YAW = NbtPath("Rotation[0]");

/** A rig for `model`; its functions are created on first use. */
export function rig(dp: Datapack, opts: RigOptions): Rig {
  const { name, model } = opts;
  const group = `${name}_rig`;
  model.named(group);
  const fn: RigFn =
    opts.fn ??
    ((n, body, o) => {
      const ref = o?.public ? dp.public(n) : dp.createFunction(n);
      ref.build(body);
      return ref;
    });
  const created = new Map<string, FunctionRef>();
  // Each function once, however often a method is emitted.
  const once = (key: string, make: () => FunctionRef) => {
    if (!created.has(key)) created.set(key, make());
    return created.get(key)!;
  };
  const internal = (short: string, body: (ctx: FunctionContext) => void) =>
    once(short, () => {
      const ref = dp.createFunction(short);
      ref.build(body);
      return ref;
    });
  // A fresh selector each use, since Selector builders mutate in place.
  const roots = () => model.rootSelector();
  const orphan = `${name}.orphan`;
  const byRotate = atLeast(dp.version, "1.21.2");

  const faceOne = () =>
    once("face_one", () => {
      const ref = fn("face_one", (c) => {
        if (byRotate) {
          // Facing a point straight ahead copies the yaw without reading NBT.
          const turn = (b: FunctionContext) => b.rotate().facing(Selector.self(), Pos.local(0, 0, 1));
          turn(c);
          c.execute().on(Relation.PASSENGERS).run(turn);
          return;
        }
        // The rig tags itself so it's still findable after `on vehicle` switches `@s`.
        const cur = `${name}.cur`;
        const me = roots().tag(cur).limit(1);
        c.tag().add(Selector.self(), cur);
        c.execute()
          .on(Relation.VEHICLE)
          .run((b) => b.entity(me).set(YAW, b.entity(Selector.self()).at(YAW)));
        c.execute()
          .on(Relation.PASSENGERS)
          .run((b) => b.entity(Selector.self()).set(YAW, b.entity(me).at(YAW)));
        c.tag().remove(Selector.self(), cur);
      });
      if (!byRotate) dp.allowNbtRead(ref, "rig yaw copy");
      return ref;
    });

  return {
    get roots() {
      return roots();
    },
    summonOn(ctx, vehicle, mounted) {
      const fresh = `${name}.new`;
      ctx.summon(model.toNbt().tagged(fresh), Pos.rel(0, 0, 0));
      ctx
        .execute()
        .as(roots().tag(fresh).distance(Range.atMost(1)))
        .run((b) => b.ride().mount(Selector.self(), vehicle()));
      if (mounted) ctx.execute().as(vehicle()).run((b) => b.call(mounted));
      // Reached through the vehicle, since mounting may have moved it.
      ctx
        .execute()
        .as(vehicle())
        .on(Relation.PASSENGERS)
        .run((b) => b.tag().remove(Selector.self(), fresh));
    },
    face(ctx) {
      const one = faceOne();
      const chain = ctx.execute();
      // `rotated as @s` rereads the yaw: the `at @s` one is from before this tick's hooks turned it.
      if (byRotate) chain.rotatedAs(Selector.self()).rotated(Pos.rel(0, Pos.abs(0)));
      chain.on(Relation.PASSENGERS).ifEntity(Selector.self().tag(`${group}_0`));
      if (byRotate) chain.positionedAs(Selector.self());
      chain.run((b) => b.call(one));
    },
    relayHits(ctx, relay) {
      // `on attacker` finds the hitter without reading NBT.
      const attacked = internal("attacked", (c) =>
        c.execute().on(Relation.ATTACKER).run((b) => b.return_(1)),
      );
      const hit = internal("relay_hit", (c) => {
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
        .ifEntity(Selector.self().tag(`${group}_hitbox`))
        .ifFunction(attacked)
        .run((b) => b.call(hit));
    },
    markOrphans: (ctx) => ctx.tag().add(roots(), orphan),
    claim: (ctx) =>
      ctx.execute().on(Relation.PASSENGERS).run((b) => b.tag().remove(Selector.self(), orphan)),
    sweep(ctx) {
      // Passengers first, since killing a vehicle only dismounts its riders.
      const kill = once("kill_rig", () =>
        fn("kill_rig", (c) => {
          c.execute().on(Relation.PASSENGERS).run((b) => b.kill(Selector.self()));
          c.kill(Selector.self());
        }),
      );
      ctx.execute().as(roots().tag(orphan)).run((b) => b.call(kill));
    },
    pose(ctx, self, members, pose, duration) {
      for (const i of members) {
        const chain = ctx.execute();
        if (self) chain.as(self);
        // Member 0 is the root (one hop); the others ride the root (two hops).
        chain.on(Relation.PASSENGERS);
        if (i !== 0) chain.on(Relation.PASSENGERS);
        chain.run((b) =>
          b.data().merge().entity(Selector.self().tag(`${group}_${i}`), displayPose(pose(i), duration)),
        );
      }
    },
  };
}
