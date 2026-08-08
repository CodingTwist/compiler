import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { v1_21_4 } from "../../../versions/profiles";
import { Objective } from "./objective";
import { Fixed } from "./fixed";
import { ScoreTarget } from "../../values/score_target";

/** Build one function body and return its rendered command lines. */
function emit(build: (sc: (n: string) => any) => void): string {
  const dp = new Datapack("test", v1_21_4);
  const work = new Objective("work");
  const sc = (n: string) => work.score(ScoreTarget(`#${n}`));
  dp.createFunction("f").build(() => build(sc));
  dp.report();
  return dp.files.get("f")!;
}

describe("Fixed", () => {
  it("negate multiplies by the -1 slot; add/sub are plain integer ops", () => {
    const out = emit((sc) => {
      const v = new Fixed(sc("v"), 1000);
      v.assign(sc("a")).add(sc("b")).sub(sc("c")).negate(sc("neg_one"));
    });
    expect(out).toContain("scoreboard players operation #v work = #a work");
    expect(out).toContain("scoreboard players operation #v work += #b work");
    expect(out).toContain("scoreboard players operation #v work -= #c work");
    expect(out).toContain("scoreboard players operation #v work *= #neg_one work");
  });

  it("divide is precision-preserving: multiply by the scale slot, THEN divide", () => {
    const out = emit((sc) => {
      const frac = new Fixed(sc("frac"), 1000, sc("scale"));
      frac.assign(sc("coef")).divide(sc("dist_sq"));
    });
    // the *= scale must come before the /= divisor (this is the anti-truncation order)
    const lines = out.split("\n");
    const mul = lines.findIndex((l) => l.includes("#frac work *= #scale work"));
    const div = lines.findIndex((l) => l.includes("#frac work /= #dist_sq work"));
    expect(mul).toBeGreaterThanOrEqual(0);
    expect(div).toBeGreaterThan(mul);
  });

  it("mul (same-scale fixed multiply) divides the scale back out", () => {
    const out = emit((sc) => {
      const a = new Fixed(sc("a"), 1000, sc("scale"));
      a.mul(new Fixed(sc("b"), 1000, sc("scale")));
    });
    expect(out).toContain("scoreboard players operation #a work *= #b work");
    expect(out).toContain("scoreboard players operation #a work /= #scale work");
  });

  it("gain/reduce are unitless and leave the scale untouched; clamp is < hi then > lo", () => {
    const out = emit((sc) => {
      const v = new Fixed(sc("v"), 1000);
      v.gain(sc("k")).reduce(sc("div")).clamp(sc("lo"), sc("hi"));
    });
    expect(out).toContain("scoreboard players operation #v work *= #k work");
    expect(out).toContain("scoreboard players operation #v work /= #div work");
    const lines = out.split("\n");
    const lt = lines.findIndex((l) => l.includes("#v work < #hi work"));
    const gt = lines.findIndex((l) => l.includes("#v work > #lo work"));
    expect(lt).toBeGreaterThanOrEqual(0);
    expect(gt).toBeGreaterThan(lt);
  });

  it("mul/divide without a scale score throw a helpful error", () => {
    expect(() =>
      emit((sc) => new Fixed(sc("v"), 1000).divide(sc("d"))),
    ).toThrow(/scale score/);
  });
});
