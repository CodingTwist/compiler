import { expect, test } from "vitest";
import { Datapack, Range, ScoreTarget, Selector } from "../../index";
import { v1_21_4 } from "../../versions/profiles";
import { buildDatapack } from "./codegen";

test("single-command private functions are inlined and dropped", () => {
  const dp = new Datapack("p", v1_21_4);
  const one = dp.createFunction("m/zzz/one");
  one.build((c: any) => c.say("one"));
  const two = dp.createFunction("m/zzz/two");
  two.build((c: any) => {
    c.say("a");
    c.say("b");
  });
  const fork = dp.createFunction("m/zzz/fork");
  fork.build((c: any) => c.execute().as(Selector.allPlayers()).run((b: any) => b.say("hi")));
  const kept = dp.createFunction("m/zzz/kept");
  kept.build((c: any) => c.say("kept"));
  const uncalled = dp.createFunction("m/zzz/uncalled");
  uncalled.build((c: any) => c.say("by hand"));
  const pub = dp.createFunction("m/pub");
  pub.build((c: any) => c.say("pub"));
  const score = dp.objective("o").score(ScoreTarget("#s"));
  dp.createFunction("f").build((c: any) => {
    c.call(one);
    c.call(pub);
    c.dispatchScore(score, [
      { range: Range.exactly(1), fn: one },
      { range: Range.exactly(2), fn: two },
      { range: Range.exactly(4), fn: fork },
    ]);
    c.call(fork);
    c.execute().ifScoreMatches(score, Range.exactly(3)).run((b: any) => {
      b.call(one);
      b.call(kept);
    });
  });
  dp.tags.set("tick" as any, new Set(["m/zzz/kept"]));

  const files = buildDatapack(dp);
  expect(dp.files.get("f")!.split("\n").slice(0, 6)).toEqual([
    "say one",
    "function p:m/pub",
    "execute if score #s o matches 1 run return run say one",
    "execute if score #s o matches 2 run return run function p:m/zzz/two",
    // `return run` would stop after the first player.
    "execute if score #s o matches 4 run return run function p:m/zzz/fork",
    "execute as @a run say hi",
  ]);
  expect(dp.files.has("m/zzz/one")).toBe(false);
  expect(dp.files.get("m/zzz/kept")).toBe("say kept");
  expect(dp.files.has("m/zzz/uncalled")).toBe(true);
  expect(dp.files.has("m/pub")).toBe(true);
  expect([...files.keys()].some((k) => k.endsWith("zzz/one.mcfunction"))).toBe(false);
  // Rebuilding must not bring the dropped file back.
  buildDatapack(dp);
  expect(dp.files.has("m/zzz/one")).toBe(false);
  // The exec child calls kept via `function`, which is inlined but its tag keeps the file.
  const exec = [...dp.files].find(([n]) => n.includes("exec"))!;
  expect(exec[1]).toBe("say one\nsay kept");
});
