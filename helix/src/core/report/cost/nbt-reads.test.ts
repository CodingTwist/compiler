import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { Selector } from "../../frontend/nodes/selector";
import { Nbt, Byte } from "../../values/nbt";
import { formatCostReport } from ".";
import { v1_21_4 } from "../../../versions/profiles";

describe("nbt read warnings", () => {
  const read = (ctx: any) =>
    ctx
      .execute()
      .as(
        Selector.allEntities()
          .tag("x")
          .nbt(Nbt({ OnGround: Byte(1) })),
      )
      .run((b: any) => b.say("landed"));

  it("warns on an ungated read every tick", () => {
    const dp = new Datapack("testpack", v1_21_4);
    dp.tick(read);
    const r = dp.report();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ fn: "tick", period: 1 });
    expect(formatCostReport(r)).toContain(
      "WARN nbt read every 1 tick(s) in tick",
    );
  });

  it("reads the cadence off clock gates, nested ones by lcm", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const inner = dp.public("inner");
    inner.build(read);
    const outer = dp.public("outer");
    outer.build((ctx) =>
      ctx.if(dp.timing.phaseGate(dp, 2), (c) => c.call(inner)),
    );
    const slow = dp.public("slow");
    slow.build(read);
    dp.tick((ctx) => {
      ctx.if(dp.timing.phaseGate(dp, 10), (c) => c.call(outer));
      ctx.if(dp.timing.phaseGate(dp, 2), (c) => c.call(slow));
    });
    const r = dp.report();
    expect(r.nbtReads.find((n) => n.fn === "inner")!.period).toBe(10);
    expect(r.warnings.map((w) => [w.fn, w.period])).toEqual([["slow", 2]]);
  });

  it("allowNbtRead moves a read out of the warnings, down through what it calls", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const child = dp.public("child");
    child.build(read);
    const hot = dp.public("hot");
    hot.build((ctx) => {
      read(ctx);
      ctx.call(child);
    });
    dp.tick((ctx) => ctx.call(hot));
    dp.allowNbtRead(hot, "landing check");
    const r = dp.report();
    expect(r.warnings).toEqual([]);
    expect(formatCostReport(r)).toContain("hot (landing check)");
    expect(r.nbtReads.find((n) => n.fn === "child")!.allowed).toBe(
      "landing check",
    );
  });

  it("ctx.allow silences its own function from inside a nested body", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const hot = dp.public("hot");
    hot.build((ctx) => {
      read(ctx);
      ctx.if(dp.timing.phaseGate(dp, 2), (c) =>
        c.allow("nbt-read", "landing check"),
      );
    });
    dp.tick((ctx) => ctx.call(hot));
    const r = dp.report();
    expect(r.warnings).toEqual([]);
    expect(r.staleAllows).toEqual([]);
    expect(formatCostReport(r)).toContain("hot (landing check)");
  });

  it("still warns on a callee reached another way without the allow", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const shared = dp.public("shared");
    shared.build(read);
    const hot = dp.public("hot");
    hot.build((ctx) => ctx.call(shared));
    dp.tick((ctx) => {
      ctx.call(hot);
      ctx.call(shared);
    });
    dp.allowNbtRead(hot, "fine");
    expect(dp.report().warnings.map((w) => w.fn)).toEqual(["shared"]);
  });
});
