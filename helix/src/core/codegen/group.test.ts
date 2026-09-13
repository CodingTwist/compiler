import { expect, test } from "vitest";
import { Datapack } from "../../index";
import { v1_21_4 } from "../../versions/profiles";
import { groupExecutePrefixes } from "./group";

function run(files: Record<string, string>): Datapack {
  const dp = new Datapack("p", v1_21_4);
  for (const [name, text] of Object.entries(files)) dp.files.set(name, text);
  groupExecutePrefixes(dp);
  return dp;
}

const AIM = "@e[tag=aim,limit=1]";

test("repeated `at @s` lines become one call", () => {
  const dp = new Datapack("p", v1_21_4);
  dp.files.set("zzz/enroll", "tag @s add tracked\nscoreboard players set @s ttl 100");
  dp.files.set(
    "throw",
    [
      `execute at @s as ${AIM} run function p:zzz/enroll`,
      `execute at @s store result score #vx b run data get entity ${AIM} Pos[0] 100`,
      "# a comment",
      `execute at @s run scoreboard players operation #lx b = ${AIM} b.vx`,
      "say done",
    ].join("\n"),
  );
  dp.sourceMap.set("throw", ["a", "b", undefined, "c", "d"]);
  groupExecutePrefixes(dp);

  expect(dp.files.get("throw")).toBe(
    "execute at @s run function p:zzz/throw/group_0\nsay done",
  );
  expect(dp.files.get("zzz/throw/group_0")).toBe(
    [
      `execute as ${AIM} run function p:zzz/enroll`,
      `execute store result score #vx b run data get entity ${AIM} Pos[0] 100`,
      "# a comment",
      `scoreboard players operation #lx b = ${AIM} b.vx`,
    ].join("\n"),
  );
  expect(dp.sourceMap.get("throw")).toEqual(["a", "d"]);
  expect(dp.sourceMap.get("zzz/throw/group_0")).toEqual(["a", "b", undefined, "c"]);
  // A rebuild must leave it as it is.
  groupExecutePrefixes(dp);
  expect(dp.files.has("zzz/throw/group_1")).toBe(false);
});

test("a single-entity scan groups at two lines when every line but the last is inert", () => {
  const dp = run({
    f: [
      `execute as ${AIM} run scoreboard players add #n o 1`,
      `execute as ${AIM} run tag @s remove aim`,
    ].join("\n"),
  });
  expect(dp.files.get("f")).toBe(`execute as ${AIM} run function p:zzz/f/group_0`);
  expect(dp.files.get("zzz/f/group_0")).toBe("scoreboard players add #n o 1\ntag @s remove aim");
});

test("lines that could change what the prefix picks are left apart", () => {
  const lines = (prefix: string, cmds: string[]) =>
    cmds.map((c) => `execute ${prefix} run ${c}`).join("\n");
  const cases: Record<string, string> = {
    // Forks: grouping would reorder per-entity work.
    fork: lines("as @e[tag=x]", ["say a", "say b", "say c"]),
    returns: lines("at @s", ["say a", "say b", "return 1"]),
    two: lines("at @s", ["say a", "say b"]),
    tp: lines("at @s", ["tp @s ~ ~1 ~", "say b", "say c"]),
    call: lines("at @s", ["function p:mover", "say b", "say c"]),
    // `tag` changes what `@e[tag=aim]` matches for the next line.
    tag: lines(`as ${AIM}`, ["tag @e remove aim", "say b"]),
    scores: lines("as @e[scores={o=1},limit=1]", ["say a", "say b"]),
    // A condition belongs to its line, so it can't be shared.
    cond: lines("if score #a o matches 1", ["say a", "say b", "say c"]),
  };
  const dp = run({ ...cases, mover: "say hi\nexecute as @a run function p:zzz/x", "zzz/x": "tp @s 0 0 0" });
  for (const [name, text] of Object.entries(cases)) expect(dp.files.get(name), name).toBe(text);
});

test("a blocking line ends one group and the rest still groups", () => {
  const dp = run({
    f: ["say a", "tp @s ~ ~1 ~", "say b", "say c", "say d"].map((c) => `execute at @s run ${c}`).join("\n"),
  });
  expect(dp.files.get("f")).toBe(
    "execute at @s run say a\nexecute at @s run tp @s ~ ~1 ~\nexecute at @s run function p:zzz/f/group_0",
  );
});
