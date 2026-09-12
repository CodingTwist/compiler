import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { v1_21_4, v26_3_rc_2 } from "../../../versions/profiles";
import { Objective } from "./objective";
import { Score } from "./score";
import { ScoreVec3 } from "./score_vec3";
import { math } from "./math";
import { ScoreTarget } from "../../values/score_target";
import { ContextFloat } from "../../values/context-provider";
import { VersionProfile } from "../../../versions/profile";
import { Selector } from "./selector";
import { currentContext } from "../context/ambient";

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

const bad2 = (f: () => void) => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected math`` to reject this");
};

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
    // `* 0.5` used to emit `0.5` as an integer constant - a provider the server
    // rejects, and `scoreboard players set … 0.5` below 26.3.
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

  it("throws below 26.3, naming the op and the target version", () => {
    const msg = (f: () => void) => {
      try {
        f();
      } catch (e) {
        return (e as Error).message;
      }
      throw new Error("expected this to be rejected on 1.21.4");
    };
    const sqrtMsg = msg(() =>
      emit(() => math`sqrt(${sc("a")})`.into(sc("d")), v1_21_4),
    );
    expect(sqrtMsg).toContain("sqrt()");
    expect(sqrtMsg).toContain("26.3");
    expect(sqrtMsg).toContain(v1_21_4.id);
    expect(
      msg(() => emit(() => math`sin(${sc("a")})`.into(sc("d")), v1_21_4)),
    ).toContain("sin()");
    expect(
      msg(() =>
        emit(
          () => math`${ContextFloat.uniform(0, 1)} + 1`.into(sc("d")),
          v1_21_4,
        ),
      ),
    ).toContain("provider leaf");
    const litMsg = msg(() =>
      emit(() => math`${sc("a")} * 0.5`.into(sc("d")), v1_21_4),
    );
    expect(litMsg).toContain("0.5");
    expect(litMsg).toContain(v1_21_4.id);
    // The `+`/`-` literal shortcut is the other path into `scoreboard players
    // add`, and it has to refuse a fraction too.
    expect(
      msg(() => emit(() => math`${sc("a")} + 0.5`.into(sc("d")), v1_21_4)),
    ).toContain("0.5");
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
