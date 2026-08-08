import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { FunctionContext } from "../frontend";
import { v1_21_4 } from "../../versions/profiles";
import { v1_20_4 } from "../../versions/profiles";

describe("weather (builder chain)", () => {
  it("emits a validated command from a fluent chain", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.createFunction("m").build((ctx: FunctionContext) => {
      ctx.weather().clear(100);
      ctx.weather().rain();
      ctx.weather().thunder(60);
    });
    // 1.21.4 uses the singular `function` folder.
    expect(buildDatapack(dp).get("data/testpack/function/m.mcfunction")).toBe(
      ["weather clear 100", "weather rain", "weather thunder 60"].join("\n"),
    );
  });

  it("the same chain renders correctly against an older version (plural folder)", () => {
    const dp = new Datapack("testpack", v1_20_4);
    dp.createFunction("m").build((ctx: FunctionContext) => {
      ctx.weather().clear(100);
    });
    expect(buildDatapack(dp).get("data/testpack/functions/m.mcfunction")).toBe(
      "weather clear 100",
    );
  });

  it("validates against the version tree - an unknown sub-command throws", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.createFunction("m").build((ctx: FunctionContext) => {
      // force-build an illegal node to prove tree validation still fires
      const b = ctx.weather() as unknown as {
        node: { parts: { kind: "literal" | "arg"; value: string }[] };
      };
      b.node.parts = [
        { kind: "literal", value: "weather" },
        { kind: "literal", value: "sunny" },
      ];
    });
    expect(() => buildDatapack(dp)).toThrow(/Unknown sub-command "sunny"/);
  });
});
