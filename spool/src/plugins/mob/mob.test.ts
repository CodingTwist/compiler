// A mob registered on a bare pack, with no twine module around it.
import { describe, expect, it } from "vitest";
import { Block, Datapack, Display, Husk, buildDatapack, quat, v26_3_rc_2 } from "helix";
import { defineMob } from ".";

describe("mob", () => {
  it("registers on a plain Datapack and exposes wake, tick and its refs", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    const mob = defineMob(Husk({}), Display(Block.STONE))
      .gesture("nod", { members: [0], pivot: [0, 0, 0], rotate: quat("x", 20) })
      .build("golem");
    expect(() => mob.summon).toThrow(/after the mob registers/);
    mob.register(dp.group("golem"));
    dp.public("tick", "tick").build((ctx) => mob.tick(ctx));
    dp.public("wake").build((ctx) => ctx.call(mob.wake));
    expect(mob.gestures.nod.getName()).toBe("golem/nod");
    expect(mob.preview().members).toHaveLength(1);
    const files = buildDatapack(dp);
    const text = (name: string) => String(files.get(`data/test/function/${name}.mcfunction`));
    expect(text("tick")).toContain("run function test:zzzprivate/golem/tick_one");
    expect(text("zzzprivate/golem/tick_one")).toContain("function test:zzzprivate/golem/face_one");
    expect(text("golem/summon")).toContain('summon minecraft:husk ~ ~ ~ {Tags:["golem","golem.new"]}');
  });
});
