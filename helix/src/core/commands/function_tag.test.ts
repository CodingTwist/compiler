import { describe, expect, it } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { Time } from "../values/time";
import { v26_1_2 } from "../../versions/profiles";

describe("function tags", () => {
  const build = (fn: (dp: Datapack) => void) => {
    const dp = new Datapack("pack", v26_1_2);
    fn(dp);
    return buildDatapack(dp);
  };

  it("emits the tag JSON with member ids derived from the refs", () => {
    const files = build((dp) => {
      const a = dp.createFunction("area/a");
      const b = dp.createFunction("area/b");
      dp.functionTag("entrance", { values: [a, b] });
    });
    expect(
      JSON.parse(files.get("data/pack/tags/function/entrance.json")!),
    ).toEqual({ replace: false, values: ["pack:area/a", "pack:area/b"] });
  });

  it("appends members when the same tag is declared again", () => {
    const files = build((dp) => {
      dp.functionTag("entrance", { values: [dp.createFunction("a")] });
      dp.functionTag("entrance", { values: [dp.createFunction("b")] });
    });
    expect(
      JSON.parse(files.get("data/pack/tags/function/entrance.json")!).values,
    ).toEqual(["pack:a", "pack:b"]);
  });

  it("ctx.callTag renders `function #<ns>:<name>`", () => {
    const files = build((dp) => {
      const tag = dp.functionTag("entrance", { values: [dp.createFunction("a")] });
      dp.createFunction("caller").build((ctx) => ctx.callTag(tag));
    });
    expect(files.get("data/pack/function/caller.mcfunction")!.trim()).toBe(
      "function #pack:entrance",
    );
  });

  it("dp.idOf gives schedule a typed id instead of a hand-written string", () => {
    const files = build((dp) => {
      const target = dp.createFunction("later");
      dp.createFunction("caller").build((ctx) => {
        ctx.schedule().function_(dp.idOf(target), Time(20));
      });
    });
    expect(files.get("data/pack/function/caller.mcfunction")!.trim()).toBe(
      "schedule function pack:later 20",
    );
  });
});
