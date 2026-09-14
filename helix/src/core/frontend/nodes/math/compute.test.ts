import { describe, it, expect } from "vitest";
import { Datapack } from "../../../ir/datapack";
import { v1_21_4, v26_3_rc_2 } from "../../../../versions/profiles";
import { Objective } from "../objective";
import { ScoreVec3 } from "../score_vec3";
import { math } from ".";
import { ScoreTarget } from "../../../values/score_target";
import { ContextFloat } from "../../../values/context-provider";
import { VersionProfile } from "../../../../versions/profile";
import { Selector } from "../selector";
import { currentContext } from "../../context/ambient";

const work = new Objective("work");
const sc = (n: string) => work.score(ScoreTarget(`#${n}`));
const vec = (n: string) => ScoreVec3.from((axis) => sc(`${n}_${axis}`));

/** Build one function body and return its rendered command lines. */
function emit(build: () => void, version: VersionProfile = v1_21_4): string[] {
  const dp = new Datapack("test", version);
  dp.createFunction("f").build(() => build());
  dp.report();
  return dp.files.get("f")!.split("\n").filter(Boolean);
}

const bad2 = (f: () => void) => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected math`` to reject this");
};

describe("math`` on /compute (26.3+)", () => {
  // The grapple rope constraint:
  //   coef = −dot + min((dist² − ropeLen²) / BAUM_DIV, baumMax)
  const coef = () =>
    math`-${sc("dot")} + min((${sc("dist_sq")} - ${sc("rope_len_sq")}) / ${sc("baum_div")}, ${sc("baum_max")})`.into(
      sc("coef"),
    );


  it("is one /compute command on 26.3", () => {
    const [line, ...rest] = emit(coef, v26_3_rc_2);
    expect(rest).toEqual([]);
    expect(line).toBe(
      "execute store result score #coef work run compute default integer " +
        '{"type":"add","inputs":[{"type":"negate","input":' +
        '{"type":"score","target":{"type":"fixed","name":"#dot"},"score":"work"}},' +
        '{"type":"min","inputs":[{"type":"floor_div","left":{"type":"sub","left":' +
        '{"type":"score","target":{"type":"fixed","name":"#dist_sq"},"score":"work"},"right":' +
        '{"type":"score","target":{"type":"fixed","name":"#rope_len_sq"},"score":"work"}},"right":' +
        '{"type":"score","target":{"type":"fixed","name":"#baum_div"},"score":"work"}},' +
        '{"type":"score","target":{"type":"fixed","name":"#baum_max"},"score":"work"}]}]}',
    );
  });

  it("crosses to the float side and back for sqrt on 26.3", () => {
    const [line, ...rest] = emit(
      () => math`sqrt(len2(${vec("v")}))`.into(sc("speed")),
      v26_3_rc_2,
    );
    expect(rest).toEqual([]);
    expect(line).toContain(
      'compute default integer {"type":"from_float","input":' +
        '{"type":"sqrt","input":{"type":"from_int","input":{"type":"add","inputs":[{"type":"mul"',
    );
  });

  it("keeps a float subexpression in floats until the destination", () => {
    // `/` after a sqrt is real division, not floor_div, and `from_float`
    // truncates exactly once - at the outside.
    const [line] = emit(
      () => math`sqrt(${sc("a")}) / 2`.into(sc("d")),
      v26_3_rc_2,
    );
    expect(line).toContain(
      'compute default integer {"type":"from_float","input":' +
        '{"type":"div","left":{"type":"sqrt","input":' +
        '{"type":"from_int","input":{"type":"score"',
    );
    expect(line).not.toContain("floor_div");
  });

  it("keeps an int-only formula off the float side entirely", () => {
    const [line] = emit(
      () => math`${sc("a")} / 2 + ${sc("b")}`.into(sc("d")),
      v26_3_rc_2,
    );
    expect(line).toContain("floor_div");
    expect(line).not.toContain("from_int");
    expect(line).not.toContain("from_float");
  });

  it("lowers len(v) to one `length` node", () => {
    const [line] = emit(() => math`len(${vec("v")})`.into(sc("d")), v26_3_rc_2);
    expect(line).toContain('{"type":"length","inputs":[{"type":"from_int"');
  });

  it("takes scalar legs in len(), as the hypotenuse", () => {
    const [line] = emit(
      () => math`len(${sc("a")}, ${sc("b")})`.into(sc("d")),
      v26_3_rc_2,
    );
    expect(line).toContain('{"type":"length","inputs":[{"type":"from_int"');
    expect(bad2(() => math`len(${vec("v")}, ${sc("a")})`)).toContain(
      "argument 1 is a vector",
    );
  });

  it("splices a provider hole in as a leaf", () => {
    const [line] = emit(
      () =>
        math`round(${ContextFloat.uniform(0, 1)} * ${sc("k")})`.into(sc("d")),
      v26_3_rc_2,
    );
    expect(line).toContain(
      '{"type":"round","input":{"type":"mul","inputs":' +
        '[{"type":"uniform","min":0,"max":1},{"type":"from_int"',
    );
  });

  it("makes a fractional literal float, so the coefficient survives", () => {
    // `* 0.5` used to emit `0.5` as an integer constant, which the server rejects.
    const [line] = emit(
      () => math`${sc("a")} * 0.5 + 1`.into(sc("d")),
      v26_3_rc_2,
    );
    expect(line).toContain(
      'compute default integer {"type":"from_float","input":' +
        '{"type":"add","inputs":[{"type":"mul","inputs":' +
        '[{"type":"from_int","input":{"type":"score"',
    );
    expect(line).toContain("0.5");
    // A whole-number literal still never forces a crossing.
    const [intOnly] = emit(
      () => math`${sc("a")} * 2 + 1`.into(sc("d")),
      v26_3_rc_2,
    );
    expect(intOnly).not.toContain("from_int");
    expect(intOnly).not.toContain("from_float");
  });

  it("skips /compute for a plain `dest ± literal`, even on 26.3", () => {
    const [add] = emit(() => math`${sc("a")} + 5`.into(sc("a")), v26_3_rc_2);
    expect(add).toBe("scoreboard players add #a work 5");
    const [sub] = emit(() => math`${sc("a")} - 5`.into(sc("a")), v26_3_rc_2);
    expect(sub).toBe("scoreboard players remove #a work 5");
    // Not the destination on both sides, or not a bare literal: still /compute.
    const [other] = emit(
      () => math`${sc("b")} + 5`.into(sc("a")),
      v26_3_rc_2,
    );
    expect(other).toContain("compute default integer");
  });

  it("hands a formula to a non-score destination as a provider", () => {
    const lines = emit(
      () =>
        currentContext()!
          .compute()
          .entityFloat(
            Selector.self(),
            math`len(${vec("v")}) * 0.05`.floatProvider,
          ),
      v26_3_rc_2,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("compute entity @s float");
    expect(lines[0]).toContain('{"type":"mul","inputs":[{"type":"length"');
    expect(bad2(() => math`vec(1, 2, 3)`.floatProvider)).toContain(
      "this formula is a vector",
    );
  });
});
