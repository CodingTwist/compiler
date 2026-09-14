import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { formatProfileReport, toFoldedStacks, type ProfileDump } from "./profile-report";
import { v1_21_4 } from "../../versions/profiles";

/** The line this is called from, in the same (source-mapped) numbering capture uses. */
const here = () => Number(/:(\d+):\d+\)?$/.exec(new Error().stack!.split("\n")[2])![1]);

describe("profile report", () => {
  const dp = new Datapack("prof", v1_21_4, undefined, { debug: { sources: true } });
  let sayHeavy = 0;
  const heavy = dp.createFunction("heavy");
  heavy.build((ctx) => {
    ctx.say("heavy"); sayHeavy = here();
    ctx.say("second");
  });
  dp.tick((ctx) => {
    ctx.say("tick");
    ctx.call(heavy);
  });

  // A hand-written mod dump: tick calls heavy (2 of 3 ticks), plus another pack's function.
  const frame = (stack: string[], command: string, selfNs: number, entries = 1) => ({ stack, command, entries, selfNs });
  const raw: ProfileDump = {
    version: 1,
    mc: "26.2",
    ticks: 3,
    wallNs: 150e6,
    calls: [
      { stack: ["prof:tick"], count: 3 },
      { stack: ["prof:tick", "prof:heavy"], count: 2 },
      { stack: ["other:thing"], count: 1 },
    ],
    frames: [
      frame(["prof:tick"], "say tick", 1_000),
      frame(["prof:tick"], "function prof:heavy", 500, 4),
      frame(["prof:tick", "prof:heavy"], "say heavy", 9_000),
      frame(["prof:tick", "prof:heavy"], "say second", 2_000),
      frame(["other:thing"], "say; not ours", 300),
      frame([], "helixprof stop", 50),
    ],
    worstTick: {
      index: 1,
      ns: 12_000,
      calls: [{ stack: ["prof:tick", "prof:heavy"], count: 1 }],
      frames: [frame(["prof:tick", "prof:heavy"], "say heavy", 8_000)],
    },
  };

  it("splits self and total time per function, with calls and static command counts", () => {
    const report = dp.profileReport(raw);
    expect(report.totalNs).toBe(12_850);
    expect(report.worstCaseCommandsPerTick).toBe(4);
    const byFn = Object.fromEntries(report.functions.map((f) => [f.fn, f]));
    expect(byFn.tick).toMatchObject({ calls: 3, selfNs: 1_500, totalNs: 12_500, commands: 2 });
    expect(byFn.heavy).toMatchObject({ calls: 2, selfNs: 11_000, totalNs: 11_000, commands: 2 });
    expect(byFn["other:thing"]).toMatchObject({ calls: 1, selfNs: 300 });
    expect(byFn["other:thing"].commands).toBeUndefined();
    expect(report.functions[0].fn).toBe("tick"); // heaviest total first
  });

  it("maps the hottest commands back to their file line and TS source", () => {
    const report = dp.profileReport(raw);
    const hot = report.commands[0];
    expect(hot).toMatchObject({ fn: "heavy", command: "say heavy", selfNs: 9_000, line: 1 });
    expect(hot.source).toMatch(new RegExp(`profile-report\\.test\\.ts:${sayHeavy}:`));
    expect(report.commands.find((c) => c.fn === "other:thing")!.line).toBeUndefined();
    expect(report.worstTick.commands[0]).toMatchObject({ fn: "heavy", selfNs: 8_000 });

    const text = formatProfileReport(report);
    expect(text).toContain("worst tick #1");
    expect(text).toContain("heavy:1  say heavy");
    expect(text).toContain(`↳ `);
  });

  it("emits folded stacks for flame-graph viewers", () => {
    expect(toFoldedStacks(raw).split("\n")).toContain("prof:tick;prof:heavy;say heavy 9000");
    expect(toFoldedStacks(raw)).toContain("other:thing;say, not ours 300");
  });

  it("rejects an unknown dump version", () => {
    expect(() => dp.profileReport({ ...raw, version: 2 as 1 })).toThrow(/unsupported version/);
  });
});
