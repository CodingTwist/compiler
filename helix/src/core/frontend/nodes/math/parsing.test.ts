import { describe, it, expect } from "vitest";
import { Datapack } from "../../../ir/datapack";
import { v1_21_4 } from "../../../../versions/profiles";
import { Objective } from "../objective";
import { Score } from "../score";
import { ScoreVec3 } from "../score_vec3";
import { math } from ".";
import { ScoreTarget } from "../../../values/score_target";
import { VersionProfile } from "../../../../versions/profile";

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
