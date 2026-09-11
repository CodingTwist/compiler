import { describe, it, expect } from "vitest";
import {
  ContextFloat as f,
  ContextInt as i,
  Datapack,
  Objective,
  ScoreTarget,
  Selector,
} from "../../index";
import { v26_2, v26_3_rc_2 } from "../../versions/profiles";
import { buildDatapack } from "../codegen/codegen";
import { supportsCommand } from "../../versions/capabilities";

const dummy = new Objective("d");
const D = (n: string) => dummy.score(ScoreTarget(n));

function render(build: (ctx: any) => void, version = v26_3_rc_2): string[] {
  const dp = new Datapack("t", version);
  dp.createFunction("fn").build(build);
  buildDatapack(dp);
  return dp.files.get("fn")!.split("\n");
}

describe("compute capability", () => {
  it("exists in 26.3 and not in 26.2", () => {
    expect(supportsCommand(v26_3_rc_2, ["compute"])).toBe(true);
    expect(supportsCommand(v26_2, ["compute"])).toBe(false);
  });
});

describe("context provider JSON", () => {
  it("renders a bare number operand as a constant, not a wrapper object", () => {
    expect(f.mul(2, 3).render(v26_3_rc_2)).toBe('{"type":"mul","inputs":[2,3]}');
  });

  it("nests recursively - the whole formula is one value", () => {
    const dist = f.sqrt(f.add(f.mul(3, 3), f.mul(4, 4)));
    expect(dist.render(v26_3_rc_2)).toBe(
      '{"type":"sqrt","input":{"type":"add","inputs":' +
        '[{"type":"mul","inputs":[3,3]},{"type":"mul","inputs":[4,4]}]}}',
    );
  });

  it("reads a score by its holder and objective", () => {
    expect(i.score(D("#vx")).render(v26_3_rc_2)).toBe(
      '{"type":"score","target":{"type":"fixed","name":"#vx"},"score":"d"}',
    );
  });

  it("renders a selector holder through the Selector concept, not a literal", () => {
    expect(i.score(dummy.score(Selector.self())).render(v26_3_rc_2)).toContain('"name":"@s"');
  });

  it("carries a fallback only when one is given", () => {
    expect(i.score(D("#vx"), 0).render(v26_3_rc_2)).toContain('"fallback":0');
  });

  it("keeps the int-only and float-only vocabularies apart", () => {
    expect(i.floorMod(-5, 2).render(v26_3_rc_2)).toBe('{"type":"floor_mod","left":-5,"right":2}');
    expect(f.length(1, 2, 3).render(v26_3_rc_2)).toBe('{"type":"length","inputs":[1,2,3]}');
    // @ts-expect-error a float expression is not an int operand - from_int/from_float are the crossings
    i.add(f.sqrt(2));
    expect(i.fromFloat(f.sqrt(2)).render(v26_3_rc_2)).toBe(
      '{"type":"from_float","input":{"type":"sqrt","input":2}}',
    );
  });
});

describe("ctx.compute()", () => {
  it("stores a whole formula into a score in one command", () => {
    const speed = f.sqrt(
      f.add(f.mul(f.fromInt(i.score(D("#vx"))), f.fromInt(i.score(D("#vx"))))),
    );
    const [line] = render((ctx) =>
      ctx
        .execute()
        .storeResultScore(D("#speed"))
        .run((b: any) => b.compute().defaultFloat(speed, 100)),
    );
    expect(line).toBe(
      "execute store result score #speed d run compute default float " +
        '{"type":"sqrt","input":{"type":"add","inputs":[{"type":"mul","inputs":' +
        '[{"type":"from_int","input":{"type":"score","target":{"type":"fixed","name":"#vx"},"score":"d"}},' +
        '{"type":"from_int","input":{"type":"score","target":{"type":"fixed","name":"#vx"},"score":"d"}}]}]}} 100',
    );
  });

  it("is rejected when the target version has no compute command", () => {
    expect(() => render((ctx) => ctx.compute().defaultInteger(i.add(1, 2)), v26_2)).toThrow();
  });
});
