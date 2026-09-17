import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { v1_20_1, v26_2 } from "../../versions/profiles";

const lines = (dp: Datapack, name: string) => dp.files.get(name)!.split("\n");

describe("dp.fn / ctx.invoke", () => {
  it("copies args into params and stores the result", () => {
    const dp = new Datapack("p", v26_2);
    const hp = dp.objective("hp").score("@s");
    const sum = dp.fn("sum", (_ctx, a, b) => a.plus(b), { public: true });
    dp.public("f").build((ctx) => ctx.invoke(sum, [2, hp], hp));
    dp.report();
    expect(lines(dp, "sum")).toEqual([
      "scoreboard players operation #sum.0 helix.var += #sum.1 helix.var",
      "return run scoreboard players get #sum.0 helix.var",
    ]);
    expect(lines(dp, "f")).toEqual([
      "scoreboard players set #sum.0 helix.var 2",
      "scoreboard players operation #sum.1 helix.var = @s hp",
      "execute store result score @s hp run function p:sum",
    ]);
  });

  it("calls a function with no result", () => {
    const dp = new Datapack("p", v26_2);
    const greet = dp.fn("greet", (ctx) => ctx.say("hi"), { public: true });
    dp.public("f").build((ctx) => ctx.invoke(greet, []));
    dp.report();
    expect(lines(dp, "f")).toEqual(["function p:greet"]);
  });

  it("rejects a wrong arg count or a missing result", () => {
    const dp = new Datapack("p", v26_2);
    const s = dp.objective("s").score("#s");
    const one = dp.fn("one", (_ctx, a) => void a.add(1));
    // @ts-expect-error wrong arity
    expect(() =>
      dp.public("f").build((ctx) => ctx.invoke(one, [1, 2])),
    ).toThrow(/takes 1 args, got 2/);
    expect(() =>
      dp.public("g").build((ctx) => ctx.invoke(one, [1], s)),
    ).toThrow(/returns nothing/);
  });

  it("refuses a result on versions without return run", () => {
    const dp = new Datapack("p", v1_20_1);
    expect(() => dp.fn("id", (_ctx, a) => a)).toThrow(/return run/);
  });
});
