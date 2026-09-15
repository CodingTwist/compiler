import { describe, it, expect } from "vitest";
import { Datapack } from "../../../ir/datapack";
import { v1_21_4, v26_3_rc_2 } from "../../../../versions/profiles";
import { Objective } from "../objective";
import { math } from ".";
import { ScoreTarget } from "../../../values/score_target";
import { ContextFloat } from "../../../values/context-provider";
import { VersionProfile } from "../../../../versions/profile";

const work = new Objective("work");
const sc = (n: string) => work.score(ScoreTarget(`#${n}`));
/** Build one function body and return its rendered command lines. */
function emit(build: () => void, version: VersionProfile = v1_21_4): string[] {
  const dp = new Datapack("test", version);
  dp.createFunction("f").build(() => build());
  dp.report();
  return dp.files.get("f")!.split("\n").filter(Boolean);
}

const op = (a: string, o: string, b: string) =>
  `scoreboard players operation #${a} work ${o} #${b} work`;

describe("math`` as a scoreboard chain", () => {
  // The grapple rope constraint:
  //   coef = −dot + min((dist² − ropeLen²) / BAUM_DIV, baumMax)
  const coef = () =>
    math`-${sc("dot")} + min((${sc("dist_sq")} - ${sc("rope_len_sq")}) / ${sc("baum_div")}, ${sc("baum_max")})`.into(
      sc("coef"),
    );

  it("drops + 0 and * 1", () => {
    expect(
      emit(() => math`${sc("a")} * ${1} - ${sc("b")} - ${0}`.into(sc("a"))),
    ).toEqual([op("a", "-=", "b")]);
  });

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
    // The `+`/`-` literal shortcut must reject fractions too.
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
