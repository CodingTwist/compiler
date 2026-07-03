import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_21_4 } from "../../versions/1_21_4";

describe("ScoreboardTiming.everyTicks phase staggering", () => {
  it("gives different-phase hooks distinct functions and a shared counter", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const a = dp.everyTicks(20); // phase 0
    const b = dp.everyTicks(20, 5); // phase 5, same period

    expect(a.getName()).not.toBe(b.getName());
    expect(b.getName()).toContain("_p5");

    buildDatapack(dp);
    const clock = dp.files.get("zzz/clock")!;
    // One shared cycle counter for the period…
    expect(clock).toContain("scoreboard players add t20 clock 1");
    // …and two distinct fire checks, one per phase.
    expect(clock).toContain("matches 0");
    expect(clock).toContain("matches 5");
  });

  it("is idempotent per (period, phase)", () => {
    const dp = new Datapack("testpack", v1_21_4);
    const first = dp.everyTicks(40, 3);
    const second = dp.everyTicks(40, 3);
    expect(first.getName()).toBe(second.getName());

    buildDatapack(dp);
    const clock = dp.files.get("zzz/clock")!;
    // The period-3 fire check appears exactly once despite two calls.
    const matches3 = clock.match(/matches 3\b/g) ?? [];
    expect(matches3).toHaveLength(1);
  });
});
