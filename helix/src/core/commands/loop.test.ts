import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { Detect } from "../frontend/detect";
import { Block, Pos } from "../values";
import { or } from "./if";
import { v1_20_1, v26_2 } from "../../versions/profiles";

const lines = (dp: Datapack, name: string) => dp.files.get(name)!.split("\n");

describe("ctx.while / ctx.repeat", () => {
  it("repeats n times on a local counter", () => {
    const dp = new Datapack("p", v26_2);
    dp.createFunction("f").build((ctx) => ctx.repeat(3, (c) => c.say("hi")));
    dp.report();
    expect(lines(dp, "f")).toEqual(["scoreboard players set #f.0 helix.var 0", "function p:zzz/f/while_0"]);
    expect(lines(dp, "zzz/f/while_0")).toEqual([
      "execute if score #f.0 helix.var matches ..2 run return run function p:zzz/f/while_0/pass_0",
    ]);
    expect(lines(dp, "zzz/f/while_0/pass_0")).toEqual([
      "say hi",
      "scoreboard players add #f.0 helix.var 1",
      "return run function p:zzz/f/while_0",
    ]);
  });

  it("advances each pass and returns the exit from where the loop stopped", () => {
    const dp = new Datapack("p", v26_2);
    const s = dp.objective("s").score("#s");
    dp.createFunction("f").build((ctx) => {
      ctx
        .while(Detect.block(Pos.here(), Block("#minecraft:air")), () => void s.remove(1), {
          advance: (e) => e.positioned(Pos.local(0, 0, 0.5)),
        })
        .else((c) => c.say("hit"));
      ctx.say("after");
    });
    dp.report();
    expect(lines(dp, "f")).toEqual(["function p:zzz/f/while_0", "say after"]);
    expect(lines(dp, "zzz/f/while_0")).toEqual([
      "execute if block ~ ~ ~ #minecraft:air run return run function p:zzz/f/while_0/pass_0",
      "return run say hit",
    ]);
    expect(lines(dp, "zzz/f/while_0/pass_0")).toEqual([
      "scoreboard players remove #s s 1",
      "execute positioned ^ ^ ^0.5 run return run function p:zzz/f/while_0",
    ]);
  });

  it("runs one pass however many chains of an or() pass", () => {
    const dp = new Datapack("p", v26_2);
    const s = dp.objective("s").score("#s");
    dp.createFunction("f").build((ctx) => void ctx.while(or(s.equal(1), s.equal(2)), (c) => c.say("x")));
    dp.report();
    expect(lines(dp, "zzz/f/while_0")).toEqual([
      "execute if score #s s matches 1 run return run function p:zzz/f/while_0/pass_0",
      "execute if score #s s matches 2 run return run function p:zzz/f/while_0/pass_0",
    ]);
  });

  it("refuses versions without return run", () => {
    const dp = new Datapack("p", v1_20_1);
    const s = dp.objective("s").score("#s");
    expect(() => dp.createFunction("f").build((ctx) => void ctx.while(s.equal(1), () => {}))).toThrow(/return run/);
  });
});
