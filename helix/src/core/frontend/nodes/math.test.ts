import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { v1_21_4, v26_3_rc_2 } from "../../../versions/profiles";
import { Objective } from "./objective";
import { Score } from "./score";
import { ScoreVec3 } from "./score_vec3";
import { math } from "./math";
import { ScoreTarget } from "../../values/score_target";
import { VersionProfile } from "../../../versions/profile";

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

const op = (a: string, o: string, b: string) =>
  `scoreboard players operation #${a} work ${o} #${b} work`;

describe("math`` parsing", () => {
  it("respects precedence and parentheses", () => {
    expect(
      emit(() => math`${sc("a")} + ${sc("b")} * ${sc("c")}`.into(sc("d"))),
    ).toEqual([
      op("d", "=", "a"),
      op("_t0", "=", "b"),
      op("_t0", "*=", "c"),
      op("d", "+=", "_t0"),
    ]);
    expect(
      emit(() => math`(${sc("a")} + ${sc("b")}) * ${sc("c")}`.into(sc("d"))),
    ).toEqual([op("d", "=", "a"), op("d", "+=", "b"), op("d", "*=", "c")]);
  });

  it("lowers unary minus as `0 - x`, no -1 slot needed", () => {
    expect(emit(() => math`-${sc("a")}`.into(sc("d")))).toEqual([
      "scoreboard players set #d work 0",
      op("d", "-=", "a"),
    ]);
  });

  it("maps min/max onto `<` and `>`", () => {
    expect(
      emit(() =>
        math`max(min(${sc("a")}, ${sc("hi")}), ${sc("lo")})`.into(sc("a")),
      ),
    ).toEqual([op("a", "<", "hi"), op("a", ">", "lo")]);
  });

  it("lowers abs without a branch", () => {
    expect(emit(() => math`abs(${sc("a")})`.into(sc("d")))).toEqual([
      op("d", "=", "a"),
      "scoreboard players set #_t0 work 0",
      op("_t0", "-=", "d"),
      op("d", ">", "_t0"),
    ]);
  });

  it("reads `·` and `dot()` as the same operator, and len2 as v·v", () => {
    const byDot = emit(() => math`${vec("a")} · ${vec("b")}`.into(sc("d")));
    expect(
      emit(() => math`dot(${vec("a")}, ${vec("b")})`.into(sc("d"))),
    ).toEqual(byDot);
    expect(emit(() => math`len2(${vec("a")})`.into(sc("d")))).toEqual(
      emit(() => math`${vec("a")} · ${vec("a")}`.into(sc("d"))),
    );
  });

  it("broadcasts a scalar across a vector, per axis", () => {
    expect(emit(() => math`${vec("v")} / ${sc("k")}`.into(vec("v")))).toEqual([
      op("v_x", "/=", "k"),
      op("v_y", "/=", "k"),
      op("v_z", "/=", "k"),
    ]);
  });

  it("builds a vector with vec() and nests one expression inside another", () => {
    const half = math`${sc("a")} / ${sc("two")}`;
    expect(
      emit(() => math`vec(${half}, ${half}, ${sc("z")})`.into(vec("o"))),
    ).toEqual([
      op("o_x", "=", "a"),
      op("o_x", "/=", "two"),
      op("o_y", "=", "a"),
      op("o_y", "/=", "two"),
      op("o_z", "=", "z"),
    ]);
  });

  it("takes the same hole more than once", () => {
    const a = sc("a");
    expect(emit(() => math`${a} * ${a}`.into(sc("d")))).toEqual([
      op("d", "=", "a"),
      op("d", "*=", "a"),
    ]);
  });
});

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
    expect(bad(() => math`sqrt(${sc("a")})`)).toContain(
      "min, max, abs, dot, len2, vec",
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

describe("math`` backends", () => {
  // grapple's rope constraint, the formula this whole layer exists for:
  //   coef = −dot + min((dist² − ropeLen²) / BAUM_DIV, baumMax)
  const coef = () =>
    math`-${sc("dot")} + min((${sc("dist_sq")} - ${sc("rope_len_sq")}) / ${sc("baum_div")}, ${sc("baum_max")})`.into(
      sc("coef"),
    );

  it("is a scoreboard chain on 1.21.4", () => {
    expect(emit(coef, v1_21_4)).toEqual([
      "scoreboard players set #coef work 0",
      op("coef", "-=", "dot"),
      op("_t0", "=", "dist_sq"),
      op("_t0", "-=", "rope_len_sq"),
      op("_t0", "/=", "baum_div"),
      op("_t0", "<", "baum_max"),
      op("coef", "+=", "_t0"),
    ]);
  });

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

  it("takes the scoreboard branch for a profile with no command tree", () => {
    const stub = {
      ...v26_3_rc_2,
      commands: undefined,
    } as unknown as VersionProfile;
    expect(
      emit(() => math`${sc("a")} + ${sc("b")}`.into(sc("d")), stub),
    ).toEqual([op("d", "=", "a"), op("d", "+=", "b")]);
  });

  it("routes through a temp when the destination is an operand, not the leftmost leaf", () => {
    expect(emit(() => math`${sc("a")} * ${sc("v")}`.into(sc("v")))).toEqual([
      op("_t0", "=", "a"),
      op("_t0", "*=", "v"),
      op("v", "=", "_t0"),
    ]);
  });

  it("charges a literal one `set` where the scoreboard needs a score operand", () => {
    expect(emit(() => math`${sc("a")} * 1000 + 7`.into(sc("d")))).toEqual([
      op("d", "=", "a"),
      "scoreboard players set #_t0 work 1000",
      op("d", "*=", "_t0"),
      "scoreboard players add #d work 7",
    ]);
  });
});

describe("math`` types", () => {
  it("accepts a Score, a ScoreVec3, a number and another expression as holes", () => {
    const e: unknown = math`${sc("a")} + ${1} + ${math`${sc("b")} * ${vec("v")} · ${vec("v")}`}`;
    expect(e).toBeTruthy();
    // @ts-expect-error a string is not an operand
    expect(() => math`${"nope"} + 1`).toThrow();
  });

  it("keeps Score destinations typed", () => {
    const d: Score = sc("d");
    expect(() => emit(() => math`${sc("a")}`.into(d))).not.toThrow();
  });
});
