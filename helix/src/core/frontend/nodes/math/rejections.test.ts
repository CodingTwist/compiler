import { describe, it, expect } from "vitest";
import { Objective } from "../objective";
import { ScoreVec3 } from "../score_vec3";
import { math } from ".";
import { ScoreTarget } from "../../../values/score_target";

const work = new Objective("work");
const sc = (n: string) => work.score(ScoreTarget(`#${n}`));
const vec = (n: string) => ScoreVec3.from((axis) => sc(`${n}_${axis}`));

describe("math`` rejections", () => {
  const bad = (f: () => void) => {
    try {
      f();
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error("expected math`` to reject this");
  };

  it("points a caret at the offending column", () => {
    const msg = bad(() => math`${sc("a")} + * ${sc("b")}`);
    expect(msg).toContain("_0 + * _1");
    expect(msg).toMatch(/\n\s+\^/);
    // the caret sits at the stray `*`, column 5 of `_0 + * _1`
    const [, src, caret] = msg.split("\n");
    expect(caret.indexOf("^")).toBe(src.indexOf("*"));
  });

  it("rejects unbalanced parens", () => {
    expect(bad(() => math`(${sc("a")} + ${sc("b")}`)).toContain("Unclosed (");
  });

  it("names an unknown function and lists the real ones", () => {
    expect(bad(() => math`atan2(${sc("a")}, 2)`)).toContain(
      "min, max, abs, avg, pow, sqrt, sin, cos, round, floor, ceil, len, dot, len2, vec",
    );
  });

  it("rejects member access - holes are whole values", () => {
    expect(bad(() => math`${vec("a")}.x + 1`)).toContain("not math");
  });

  it("rejects vector * vector, pointing at the dot product", () => {
    expect(bad(() => math`${vec("a")} * ${vec("b")}`)).toContain("dot()");
  });

  it("rejects a vector formula into a single Score", () => {
    expect(bad(() => math`${vec("a")} + ${vec("b")}`.into(sc("d")))).toContain(
      "needs a ScoreVec3",
    );
  });

  it("rejects a scalar formula into a ScoreVec3", () => {
    expect(bad(() => math`${sc("a")} + 1`.into(vec("o")))).toContain(
      "needs a single Score",
    );
  });

  it("rejects a bare name", () => {
    expect(bad(() => math`x + 1`)).toContain("${} holes");
  });
});

