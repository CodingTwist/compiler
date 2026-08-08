import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { Selector } from "../frontend/nodes/selector";
import { v1_21_4 } from "../../versions/profiles";

describe("cost report", () => {
  it("counts worst-case commands reachable from tick across called functions", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const helper = dp.createFunction("helper");
    helper.build((ctx) => {
      ctx.say("a");
      ctx.say("b");
    });
    dp.tick((ctx) => {
      ctx.say("hi");
      ctx.call(helper); // one call line + helper's two commands
    });

    const report = dp.report();
    const tickRoot = report.tickRoots.find((r) => r.root === "tick")!;

    // tick: `say hi` + `function …:helper` = 2; helper: 2 → 4 total
    expect(tickRoot.worstCaseCommands).toBe(4);
    expect(tickRoot.reachableFunctions).toBe(2);
    expect(report.totalWorstCaseCommandsPerTick).toBe(4);
  });

  it("partitions a tick root's cost across its direct call sites, with guards", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const cheap = dp.createFunction("cheap");
    cheap.build((ctx) => ctx.say("a"));
    const heavy = dp.createFunction("heavy");
    heavy.build((ctx) => {
      ctx.say("a");
      ctx.say("b");
      ctx.say("c");
    });
    dp.tick((ctx) => {
      ctx.say("dispatch"); // the root's own (self) line
      ctx.call(cheap); // unconditional
      ctx
        .execute()
        .as(Selector.allPlayers())
        .run((b) => b.call(heavy)); // guarded
    });

    const root = dp.report().tickRoots.find((r) => r.root === "tick")!;

    // self = `say dispatch` + the two call lines = 3.
    expect(root.selfCommands).toBe(3);
    // Heaviest first; numbers partition the subtree (self + breakdown = worst case).
    expect(root.breakdown.map((c) => c.callee)).toEqual(["heavy", "cheap"]);
    expect(root.breakdown[0]).toMatchObject({ callee: "heavy", commands: 3, functions: 1 });
    expect(root.breakdown[1]).toMatchObject({ callee: "cheap", commands: 1, functions: 1 });
    expect(root.breakdown[0].guard).toBe("as @a");
    expect(root.breakdown[1].guard).toBe("");
    expect(root.selfCommands + root.breakdown.reduce((s, c) => s + c.commands, 0)).toBe(
      root.worstCaseCommands,
    );
  });

  it("flags an unbounded @e scan but not a narrowed one", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.tick((ctx) => {
      ctx.say("x"); // benign
      ctx.kill(Selector.allEntities()); // unbounded scan: bare @e
      ctx.kill(Selector.allEntities().tag("registered").limit(1)); // narrowed - not flagged
    });

    const report = dp.report();
    const allScans = report.unboundedScanners.flatMap((f) => f.unboundedScans);

    expect(allScans).toContain("@e");
    expect(allScans.some((s) => s.includes("limit="))).toBe(false);
    expect(allScans.some((s) => s.includes("tag="))).toBe(false);
  });

  it("reports no scanners for a clean tick", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.tick((ctx) => ctx.say("clean"));

    const report = dp.report();
    expect(report.unboundedScanners).toHaveLength(0);
  });
});
