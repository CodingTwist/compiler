import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { v1_21_4 } from "../../../versions/1_21_4";
import { Objective } from "./objective";
import { ScoreVec3 } from "./score_vec3";
import { ScoreTarget } from "../../values/score_target";

/** Build one function body and return its rendered command lines. */
function emit(build: (vec: (p: string) => ScoreVec3, sc: (n: string) => any) => void): string {
  const dp = new Datapack("test", v1_21_4);
  const work = new Objective("work");
  const vec = (p: string) =>
    new ScoreVec3(
      work.score(ScoreTarget(`#${p}_x`)),
      work.score(ScoreTarget(`#${p}_y`)),
      work.score(ScoreTarget(`#${p}_z`)),
    );
  const sc = (n: string) => work.score(ScoreTarget(`#${n}`));
  dp.createFunction("f").build(() => build(vec, sc));
  dp.report();
  return dp.files.get("f")!;
}

describe("ScoreVec3", () => {
  it("emits component-wise =, -=, *= for assign/sub/scale", () => {
    const out = emit((vec, sc) => {
      vec("v").assign(vec("pos")).sub(vec("prev")).scale(sc("k"));
    });
    // assign
    expect(out).toContain("scoreboard players operation #v_x work = #pos_x work");
    expect(out).toContain("scoreboard players operation #v_z work = #pos_z work");
    // sub
    expect(out).toContain("scoreboard players operation #v_y work -= #prev_y work");
    // scale
    expect(out).toContain("scoreboard players operation #v_x work *= #k work");
  });

  it("computes a dot product into out via the scratch slot", () => {
    const out = emit((vec, sc) => {
      vec("a").dot(vec("b"), sc("dot"), sc("scratch"));
    });
    expect(out).toContain("scoreboard players operation #dot work = #a_x work");
    expect(out).toContain("scoreboard players operation #dot work *= #b_x work");
    expect(out).toContain("scoreboard players operation #scratch work = #a_y work");
    expect(out).toContain("scoreboard players operation #scratch work *= #b_y work");
    expect(out).toContain("scoreboard players operation #dot work += #scratch work");
  });

  it("clamps every axis into [lo, hi] (< hi then > lo)", () => {
    const out = emit((vec, sc) => {
      vec("imp").clamp(sc("min"), sc("max"));
    });
    expect(out).toContain("scoreboard players operation #imp_x work < #max work");
    expect(out).toContain("scoreboard players operation #imp_x work > #min work");
    expect(out).toContain("scoreboard players operation #imp_z work < #max work");
  });
});
