import { describe, expect, it } from "vitest";
import { Datapack, Detect, EntityType, Pos, Selector, buildDatapack, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { probe } from "./index";

installKit([probe]);

function build(enabled: boolean): Map<string, string> {
  const dp = new Datapack("art", v1_21_4);
  const suite = dp.probe({ enabled });
  suite.case("tnt exists", {
    setup: (ctx) => void ctx.summon(EntityType.TNT, Pos.here()),
    after: 40,
    expect: Detect.entity(Selector.allEntities().type("tnt")),
    teardown: (ctx) => void ctx.kill(Selector.allEntities().type("tnt")),
  });
  suite.case("second", { expect: Detect.entity(Selector.allPlayers()) });
  suite.run();
  return new Map(buildDatapack(dp));
}

const text = (files: Map<string, string>): string => [...files.values()].join("\n");

describe("probe", () => {
  it("captures the condition as a 0/1 score with no run clause", () => {
    expect(text(build(true))).toContain(
      "execute store success score #ok Probe if entity @e[type=tnt]",
    );
  });

  it("chains the cases and ends at the report", () => {
    const all = text(build(true));
    expect(all).toContain("schedule function art:probe/tnt_exists/check 40");
    expect(all).toContain("schedule function art:probe/second/setup 1");
    expect(all).toContain("schedule function art:probe/report 1");
    expect(all).toContain("function art:probe/tnt_exists/setup"); // probe/run entry
  });

  it("reports both branches", () => {
    const all = text(build(true));
    expect(all).toContain("if score #ok Probe matches 1");
    expect(all).toContain("if score #ok Probe matches 0");
  });

  it("emits nothing when disabled", () => {
    const files = [...build(false).keys()].filter((p) => p.includes("probe"));
    expect(files).toEqual([]);
  });
});
