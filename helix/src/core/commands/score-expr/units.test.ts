import { describe, expect, it } from "vitest";
import { Datapack } from "../../ir/datapack";
import { buildDatapack } from "../../codegen/codegen";
import { v1_21_4, v26_3_rc_2 } from "../../../versions/profiles";
import type { VersionProfile } from "../../../versions/profile";
import { ScoreTarget } from "../../values/score_target";
import { math } from "../../frontend/nodes/math";
import { ScoreVec3 } from "../../frontend/nodes/score_vec3";
import type { Score } from "../../frontend/nodes/score";
import { Sim } from "../../sim";
import type { ScoreRangeNode } from "../if";

/** Runs `body` once as a tick on scores of objective `x`, and returns the sim and the rendered tick. */
function run(body: (s: (name: string) => Score) => void, version: VersionProfile = v26_3_rc_2, seed: Record<string, number> = {}) {
  const dp = new Datapack("test", version);
  const obj = dp.objective("x");
  dp.tick(() => body((n) => obj.score(ScoreTarget(`#${n}`))));
  const files = buildDatapack(dp);
  const sim = new Sim(files);
  for (const [k, v] of Object.entries(seed)) sim.setScore(`#${k}`, "x", v);
  sim.tick();
  const read = (n: string) => sim.score(`#${n}`, "x");
  const lines = [...dp.files.values()].join("\n");
  return { read, lines, errors: sim.errors };
}

describe("scaled scores", () => {
  it("keeps same-scale addition on the scoreboard, even without /compute", () => {
    const { read, lines } = run(
      (s) => math`${s("p").scaled(1000)} + ${s("v").scaled(1000)} - 0.049`.into(s("p").scaled(1000)),
      v1_21_4,
      { p: 2500, v: 100 },
    );
    expect(read("p")).toBe(2551);
    expect(lines).not.toContain("compute");
  });

  it("converts between scales through real values, rounding at the destination", () => {
    const { read, errors } = run(
      (s) => {
        math`${s("mm").scaled(1000)} * 0.995`.into(s("mm").scaled(1000));
        math`${s("mm").scaled(1000)}`.into(s("cm").scaled(100));
        math`len(vec(${s("a").scaled(1000)}, ${s("b").scaled(1000)}, 0))`.into(s("len").scaled(1000));
      },
      v26_3_rc_2,
      { mm: 1000, a: 3000, b: 4000 },
    );
    expect(errors).toEqual([]);
    expect(read("mm")).toBe(995);
    expect(read("cm")).toBe(100);
    expect(read("len")).toBe(5000);
  });

  it("reads a scaled slot into a plain score as its truncated real value", () => {
    const { read } = run((s) => math`${s("mm").scaled(1000)} + 0.0`.into(s("n")), v26_3_rc_2, { mm: 2750 });
    expect(read("n")).toBe(2);
  });

  it("takes literals in real units for set and vectors", () => {
    const { read, lines } = run((s) => {
      s("d").scaled(1000).set(0.049);
      s("q").scaled(10000).set(0.96592583);
      math`vec(0.5, 1, -0.25)`.into(ScoreVec3.from((a) => s(`v_${a}`)).scaled(1000));
    });
    expect(read("d")).toBe(49);
    expect(read("q")).toBe(9659);
    expect(read("v_z")).toBe(-250);
    expect(lines).toContain("scoreboard players set #d x 49");
  });

  it("rounds comparison bounds inward", () => {
    const d = new Datapack("t", v26_3_rc_2).objective("x").score(ScoreTarget("#d")).scaled(1000);
    const range = (n: unknown) => (n as ScoreRangeNode).range;
    expect(range(d.greaterThan(0.0205))).toMatchObject({ min: 21 });
    expect(range(d.lessThan(0.0205))).toMatchObject({ max: 20 });
    expect(range(d.atLeast(0.049))).toMatchObject({ min: 49 });
  });

  it("refuses scoreboard operations and compares across scales", () => {
    const obj = new Datapack("t", v26_3_rc_2).objective("x");
    const mm = obj.score(ScoreTarget("#a")).scaled(1000);
    const cm = obj.score(ScoreTarget("#b")).scaled(100);
    expect(() => mm.lessThan(cm)).toThrow("scale 1000 with scale 100");
    expect(() => run((s) => s("a").scaled(1000).assign(s("b")))).toThrow("scale 1000 with scale 1");
    expect(() => mm.equal(0.0005)).toThrow("isn't a whole unit");
  });

  it("needs /compute to convert scales on older versions", () => {
    expect(() => run((s) => math`${s("a").scaled(1000)} * 0.5`.into(s("b").scaled(100)), v1_21_4)).toThrow("26.3");
  });
});
