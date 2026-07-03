import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { FunctionNode } from "../ir/node";
import { SayNode } from "../commands/saycommand";
import { buildDatapack, buildPackMcmeta } from "./codegen";
import { VersionProfile } from "../../versions/profile";
import { v1_21_4 } from "../../versions/1_21_4";
import { v1_20_4 } from "../../versions/1_20_4";

// A synthetic newer profile that uses the range pack-format form (no released
// version at/below pack format 61 emits the range, so this stays hand-built).
const vRange: VersionProfile = {
  ...v1_21_4,
  id: "range-test",
  pack: { kind: "range", min: [80, 0], max: [82, 0] },
};

function packWith(version: VersionProfile): Datapack {
  const dp = new Datapack("testpack", version);
  const fn = new FunctionNode("main");
  fn.push(new SayNode("hello"));
  dp.functions.set("main", fn);
  return dp;
}

describe("version-driven paths and pack format", () => {
  it("emits singular folders for 1.21+ and plural for pre-1.21", () => {
    const modern = buildDatapack(packWith(v1_21_4));
    const legacy = buildDatapack(packWith(v1_20_4));

    expect(modern.has("data/testpack/function/main.mcfunction")).toBe(true);
    expect(legacy.has("data/testpack/functions/main.mcfunction")).toBe(true);
  });

  it("produces identical .mcfunction content across versions", () => {
    const modern = buildDatapack(packWith(v1_21_4));
    const legacy = buildDatapack(packWith(v1_20_4));

    expect(modern.get("data/testpack/function/main.mcfunction")).toBe(
      legacy.get("data/testpack/functions/main.mcfunction"),
    );
  });

  it("scalar pack format uses pack_format", () => {
    expect(buildPackMcmeta(packWith(v1_20_4))).toEqual({
      pack: { pack_format: 26, description: "testpack" },
    });
  });

  it("range pack format uses min_format/max_format", () => {
    expect(buildPackMcmeta(packWith(vRange))).toEqual({
      pack: {
        description: "testpack",
        min_format: [80, 0],
        max_format: [82, 0],
      },
    });
  });
});
