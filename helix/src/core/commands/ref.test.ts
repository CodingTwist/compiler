import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { Selector } from "../frontend/nodes/selector";
import { EntityType } from "../values/resource.generated";
import { v1_21_4 } from "../../versions/profiles";

/** Every function file, joined, after a full report build. */
function output(dp: Datapack): string {
  dp.report();
  return [...dp.files.values()].join("\n");
}

describe("ctx.ref", () => {
  it("tags @s around the body and finds it by tag from another executor", () => {
    const dp = new Datapack("p", v1_21_4);
    dp.createFunction("mob/hit").build((ctx) =>
      ctx.ref(Selector.self(), (c, mob) => {
        c.execute()
          .as(Selector.allPlayers())
          .run((b) => b.say(`${mob().render(v1_21_4)}`));
      }),
    );
    output(dp);
    expect(dp.files.get("mob/hit")!.trim().split("\n")).toEqual([
      "tag @s add helix.ref.mob.hit.0",
      "execute as @a run say @e[tag=helix.ref.mob.hit.0,limit=1]",
      "tag @s remove helix.ref.mob.hit.0",
    ]);
  });

  it("removes a world selector's tag by tag, and numbers refs per root", () => {
    const dp = new Datapack("p", v1_21_4);
    dp.createFunction("f").build((ctx) => {
      ctx.ref(Selector.allPlayers(), () => {});
      ctx.ref(Selector.self(), () => {});
    });
    const out = output(dp);
    expect(out).toContain("tag @a add helix.ref.f.0");
    expect(out).toContain("tag @e[tag=helix.ref.f.0] remove helix.ref.f.0");
    expect(out).toContain("tag @s add helix.ref.f.1");
  });

  it("keeps the target's type on lookups", () => {
    const dp = new Datapack("p", v1_21_4);
    dp.createFunction("f").build((ctx) =>
      ctx.ref(
        Selector.self().type(EntityType.HUSK),
        (c, mob) => void c.kill(mob()),
      ),
    );
    expect(output(dp)).toContain(
      "kill @e[tag=helix.ref.f.0,limit=1,type=minecraft:husk]",
    );
  });
});
