import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { Datapack } from "../ir/datapack";
import { Selector } from "../frontend/nodes/selector";
import { Nbt, Byte } from "../values/nbt";
import { buildDatapack } from "../codegen/codegen";
import { formatCostReport } from "../report/cost";
import { v1_21_4 } from "../../versions/profiles";
import type { DebugOptions } from "./sources";

/** The line this is called from, in the same (source-mapped) numbering capture uses. */
const here = () =>
  Number(/:(\d+):\d+\)?$/.exec(new Error().stack!.split("\n")[2])![1]);

function pack(debug?: DebugOptions) {
  const dp = new Datapack("dbg", v1_21_4, undefined, { debug });
  const lines: Record<string, number> = {};
  dp.tick((ctx) => {
    const sel = Selector.allEntities()
      .tag("x")
      .nbt(Nbt({ OnGround: Byte(1) }));
    lines.a = here() + 1;
    ctx.say("a");
    lines.b = here() + 1;
    ctx.say("b");
    lines.read = here() + 1;
    const asSel = ctx.execute().as(sel);
    asSel.run((c) => c.say("hit"));
  });
  return { dp, lines };
}

describe("debug source tracking", () => {
  it("is off by default: no comments, no map, same output", () => {
    const { dp } = pack();
    const plain = buildDatapack(dp);
    expect(dp.sourceMap.size).toBe(0);
    expect([...plain.values()].some((t) => t.includes("# "))).toBe(false);
    expect(plain).toEqual(buildDatapack(pack({}).dp));
  });

  it("maps each rendered line to the test line that emitted it", () => {
    const { dp, lines } = pack({ sources: true });
    buildDatapack(dp);
    const locs = dp.sourceMap.get("tick")!;
    expect(locs[0]).toMatch(new RegExp(`sources\\.test\\.ts:${lines.a}:\\d+$`));
    expect(locs[1]).toMatch(new RegExp(`sources\\.test\\.ts:${lines.b}:\\d+$`));
    expect(locs[2]).toMatch(
      new RegExp(`sources\\.test\\.ts:${lines.read}:\\d+$`),
    );
    expect(dp.files.get("tick")).not.toContain("#");
  });

  it("comments: writes # <loc> above each line, and the report still counts commands", () => {
    const { dp, lines } = pack({ comments: true });
    const report = dp.report();
    const text = dp.files.get("tick")!.split("\n");
    expect(text[0]).toMatch(new RegExp(`^# .*sources\\.test\\.ts:${lines.a}:`));
    expect(text[1]).toBe("say a");
    expect(dp.sourceMap.get("tick")![0]).toBeUndefined(); // the comment line itself
    expect(report.tickRoots[0].worstCaseCommands).toBe(3);
  });

  it("puts the source under a report warning", () => {
    const { dp, lines } = pack({ sources: true });
    const report = dp.report();
    expect(report.warnings[0].source).toMatch(
      new RegExp(`sources\\.test\\.ts:${lines.read}:`),
    );
    expect(formatCostReport(report)).toContain(`↳ `);
  });

  it("writes helix-sources.json with 1-based file lines, and removes it when off", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-sources-test-"));
    try {
      const { dp, lines } = pack({ comments: true });
      await dp.writeDatapack(dir);
      const map = JSON.parse(
        fs.readFileSync(path.join(dir, "helix-sources.json"), "utf-8"),
      );
      expect(map.tick["2"]).toMatch(
        new RegExp(`sources\\.test\\.ts:${lines.a}:`),
      ); // line 1 is the comment
      await pack().dp.writeDatapack(dir);
      expect(fs.existsSync(path.join(dir, "helix-sources.json"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
