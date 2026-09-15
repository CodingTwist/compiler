// A rig on its own: summon, face, relay, and cleanup, emitted once however often they're called.
import { describe, expect, it } from "vitest";
import { Block, Datapack, Display, Selector, buildDatapack, v26_3_rc_2 } from "helix";
import { rig } from ".";

describe("rig", () => {
  it("rides a vehicle and cleans up without a mob", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    const r = rig(dp, { name: "cart", model: Display(Block.STONE).hitbox(1, 1) });
    const cart = () => Selector.allEntities().tag("cart").limit(1);
    dp.createFunction("spawn").build((ctx) => r.summonOn(ctx, cart));
    dp.createFunction("poll").build((ctx) => {
      r.face(ctx);
      r.face(ctx);
      r.relayHits(ctx, { damage: 2 });
    });
    dp.createFunction("sweep").build((ctx) => {
      r.markOrphans(ctx);
      r.sweep(ctx);
    });
    const files = buildDatapack(dp);
    const text = (name: string) => String(files.get(`data/test/function/${name}.mcfunction`));
    expect(text("spawn")).toContain("run ride @s mount @e[tag=cart,limit=1]");
    expect(text("spawn")).toContain("on passengers run tag @s remove cart.new");
    expect(text("poll").match(/function test:cart\/zzz\/face_one/g)).toHaveLength(2);
    expect(text("cart/zzz/relay_hit")).toContain("damage @s 2");
    expect(text("sweep")).toContain("tag @e[tag=cart_rig_0,type=minecraft:block_display] add cart.orphan");
    expect(text("cart/zzz/kill_rig")).toContain("on passengers run kill @s");
  });
});
