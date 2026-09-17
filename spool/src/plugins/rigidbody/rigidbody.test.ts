import { describe, it, expect } from "vitest";
import { Datapack, Item, quat, v26_3_rc_2 } from "helix";
import { installKit } from "../../kit";
import { rigidbody } from ".";

installKit([rigidbody]);

function build() {
  const dp = new Datapack("test", v26_3_rc_2);
  const rb = dp.rigidbody();
  dp.public("drop").build((ctx) =>
    rb.spawn(ctx, { item: Item.TARGET, size: 1.5, rotation: quat("x", 30) }),
  );
  dp.report();
  return dp;
}

const lines = (dp: Datapack, fn: string) => dp.files.get(fn)!.split("\n").filter(Boolean);

describe("dp.rigidbody", () => {
  it("steps awake bodies each tick", () => {
    const tick = lines(build(), "zzzprivate/plugin/rigidbody/tick");
    expect(tick.at(-1)).toBe("execute as @e[scores={rb.sleep=0},tag=rb.body,type=minecraft:item_display] run function test:zzzprivate/plugin/rigidbody/step");
  });

  it("integrates the quaternion with /compute, not scoreboard chains", () => {
    const step = lines(build(), "zzzprivate/plugin/rigidbody/step").join("\n");
    expect(step).toContain('"type":"length"');
    expect(step).toContain("function test:zzzprivate/plugin/rigidbody/solve/pass");
  });

  it("tests every vertex against the passthrough tag", () => {
    const dp = build();
    const step = lines(dp, "zzzprivate/plugin/rigidbody/step").join("\n");
    expect(step.match(/unless block ~ ~ ~ #test:rb\/passthrough/g)).toHaveLength(8);
    expect(dp.tags.get?.("block/rb/passthrough") ?? dp.registryTagDefs.get("block/rb/passthrough")).toBeTruthy();
  });

  it("seeds a spawned body's quaternion ×10000", () => {
    const drop = build().files;
    const all = [...drop.entries()].filter(([k]) => k.includes("drop")).map(([, v]) => v).join("\n");
    expect(all).toMatch(/scoreboard players set @s rb\.qw 9659/);
    expect(all).toMatch(/scoreboard players set @s rb\.half 750/);
  });

});
