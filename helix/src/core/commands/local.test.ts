import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { math } from "../frontend/nodes/math";
import { v1_20_1, v1_21_4, v26_3_rc_2 } from "../../versions/profiles";

/** Every function file, joined, after a full report build. */
function output(dp: Datapack): string {
  dp.report();
  return [...dp.files.values()].join("\n");
}

describe("ctx.let", () => {
  it("names holders per root function, shared by its bodies", () => {
    const dp = new Datapack("p", v1_21_4);
    const hp = dp.objective("hp").score("@s");
    dp.createFunction("a").build((ctx) => {
      const x = ctx.let(5);
      ctx.if(x.equal(5), (c) => void c.let(hp));
    });
    dp.createFunction("b").build((ctx) => void ctx.let());
    const out = output(dp);
    expect(out).toContain("scoreboard players set #a.0 helix.var 5");
    expect(out).toContain(
      "scoreboard players operation #a.1 helix.var = @s hp",
    );
    expect(dp.functionRef("b")!.node.locals).toBe(1);
    expect(out).toContain("scoreboard objectives add helix.var dummy");
  });

  it("declares the objective only when a local is used", () => {
    const dp = new Datapack("p", v1_21_4);
    dp.createFunction("a").build((ctx) => ctx.say("hi"));
    expect(output(dp)).not.toContain("helix.var");
  });

  it("lowers a math init for the target version", () => {
    for (const [version, expected] of [
      [
        v1_21_4,
        "scoreboard players operation #f.1 helix.var *= #f.0 helix.var",
      ],
      [v26_3_rc_2, "execute store result score #f.1 helix.var run compute"],
    ] as const) {
      const dp = new Datapack("p", version);
      dp.createFunction("f").build((ctx) => {
        const x = ctx.let(3);
        // Three commands as a chain, so 26.3 takes /compute.
        ctx.let(math`${x} * ${x} + ${x}`);
      });
      buildDatapack(dp);
      expect(dp.files.get("f")).toContain(expected);
    }
  });

  it("records the branch taken on versions without return run", () => {
    const dp = new Datapack("p", v1_20_1);
    const s = dp.objective("s").score("#s");
    dp.createFunction("f").build((ctx) => {
      ctx
        .if(s.equal(1), (c) => void c.say("one"))
        .elif(s.equal(2), (c) => void c.say("two"))
        .else((c) => void c.say("no"));
    });
    buildDatapack(dp);
    expect(dp.files.get("f")!.split("\n")).toEqual([
      "scoreboard players set #f.0 helix.var 0",
      "execute if score #f.0 helix.var matches 0 if score #s s matches 1 run scoreboard players set #f.0 helix.var 1",
      "execute if score #f.0 helix.var matches 0 if score #s s matches 2 run scoreboard players set #f.0 helix.var 2",
      "execute if score #f.0 helix.var matches 1 run say one",
      "execute if score #f.0 helix.var matches 2 run say two",
      "execute if score #f.0 helix.var matches 0 run say no",
    ]);
  });
});
