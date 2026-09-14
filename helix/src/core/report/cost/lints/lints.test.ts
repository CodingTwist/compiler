import { describe, it, expect } from "vitest";
import { Datapack } from "../../../ir/datapack";
import { Selector } from "../../../frontend/nodes/selector";
import { Nbt, Byte } from "../../../values/nbt";
import { analyzeCost, formatCostReport, type LintRule } from "..";
import { v1_21_4 } from "../../../../versions/profiles";

describe("wiki lints", () => {
  /** Analyse hand-written rendered functions; `tick` is the tick root. */
  const lintsOf = (files: Record<string, string>, allow?: [LintRule, string, string]) => {
    const dp = new Datapack("p", v1_21_4);
    dp.files = new Map(Object.entries(files));
    dp.tags.set("tick", new Set(["tick"]));
    if (allow) dp.allow(...allow);
    return analyzeCost(dp);
  };
  const rules = (files: Record<string, string>) => lintsOf(files).lints.map((l) => l.rule);

  it("vacuous-execute: only with no subcommands", () => {
    expect(rules({ tick: "execute run say hi" })).toEqual(["vacuous-execute"]);
    expect(rules({ tick: "execute as @a run say hi" })).toEqual([]);
  });

  it("vacuous-execute applies outside the tick tree too", () => {
    expect(rules({ tick: "say hi", other: "execute run say hi" })).toEqual(["vacuous-execute"]);
  });

  it("fold-into-selector: score and entity checks right after `as`", () => {
    const r = lintsOf({ tick: "execute as @a[tag=hider] if score @s timer matches 0.. run say x" });
    expect(r.lints).toHaveLength(1);
    expect(r.lints[0].hint).toContain("@a[tag=hider,scores={timer=0..}]");
    expect(lintsOf({ tick: "execute as @e[type=zombie] if entity @s[tag=a] run say x" }).lints[0].hint).toContain(
      "@e[type=zombie,tag=a]",
    );
  });

  it("fold-into-selector: not after another clause, not across limit, not on a type clash", () => {
    expect(rules({ tick: "execute as @a at @s if score @s timer matches 0.. run say x" })).toEqual([]);
    expect(rules({ tick: "execute as @e[type=pig,limit=1,sort=nearest] if score @s t matches 1 run say x" })).toEqual([]);
    expect(rules({ tick: "execute as @e[type=pig] if entity @s[type=cow] run say x" })).toEqual([]);
  });

  it("redundant-as: multi-target commands only", () => {
    const r = lintsOf({ tick: "execute as @a[tag=hider] run effect give @s glowing" });
    expect(r.lints.map((l) => l.rule)).toEqual(["redundant-as"]);
    expect(r.lints[0].hint).toContain("effect give @a[tag=hider] glowing");
    expect(rules({ tick: "execute as @a at @s run effect give @s glowing" })).toEqual([]);
    expect(rules({ tick: "execute as @e[type=pig] run data modify entity @s Motion set value [0d,1d,0d]" })).toEqual([]);
    expect(rules({ tick: "execute as @a run scoreboard players operation @s a += @s b" })).toEqual([]);
  });

  it("missing-type: @e without type, in every function", () => {
    expect(rules({ tick: "kill @e[tag=altar]" })).toEqual(["missing-type"]);
    expect(rules({ tick: "kill @e[type=marker,tag=altar]" })).toEqual([]);
    expect(rules({ tick: "say hi", other: "kill @e[tag=altar]" })).toEqual(["missing-type"]);
    expect(rules({ tick: "say hi", other: "kill @e" })).toEqual(["missing-type"]);
    expect(rules({ tick: "kill @e" })).toEqual([]); // reported as an unbounded scan instead
  });

  it("constant-condition: a fake-player score set earlier in the function", () => {
    const r = lintsOf({
      tick: "say hi",
      other: ["scoreboard players set #done q 0", "execute if score #done q matches 0 run say a", "execute unless score #done q matches ..-1 run say b", "execute if score #done q matches 1.. run say c"].join("\n"),
    });
    expect(r.lints.map((l) => l.rule)).toEqual(["constant-condition", "constant-condition", "constant-condition"]);
    expect(r.lints.map((l) => l.hint.includes("always passes"))).toEqual([true, true, false]);
  });

  it("constant-condition: forgets the value after a write or a call", () => {
    const r = (second: string) => rules({ tick: "say hi", other: `scoreboard players set #a q 0\n${second}\nexecute if score #a q matches 0 run say x` });
    expect(r("scoreboard players add #a q 1")).toEqual([]);
    expect(r("function p:elsewhere")).toEqual([]);
    expect(r("execute store result score #a q run time query gametime")).toEqual([]);
    expect(rules({ tick: "say hi", other: "scoreboard players set @s q 0\nexecute if score @s q matches 0 run say x" })).toEqual([]);
  });

  it("group-execute: consecutive lines sharing a condition-free prefix", () => {
    const r = lintsOf({
      tick: "say hi",
      other: ["# comment", "execute on passengers run tag @s add a", "# comment", "execute on passengers store result score @s q run data get entity @s Air", "execute on passengers run tag @s add b", "say break", "execute on passengers run say x"].join("\n"),
    });
    expect(r.lints.map((l) => l.rule)).toEqual(["group-execute"]);
    expect(r.lints[0].hint).toContain("3 lines");
    // Two lines only pay off when the prefix scans.
    expect(rules({ tick: "say hi", other: "execute on passengers run say 1\nexecute on passengers run say 2" })).toEqual([]);
    expect(rules({ tick: "say hi", other: "execute as @e[type=marker,tag=a,limit=1] run say 1\nexecute as @e[type=marker,tag=a,limit=1] run say 2" })).toEqual(["group-execute"]);
    expect(rules({ tick: "say hi", other: "execute if score #a q matches 1 run say 1\nexecute if score #a q matches 1 run say 2" })).toEqual([]);
    expect(rules({ tick: "say hi", other: "execute at @s run return run say 1\nexecute at @s run say 2" })).toEqual([]);
  });

  it("repeated-selector: the same scan on two lines, compiler limit=1 ignored", () => {
    const r = lintsOf({
      tick: [
        "execute as @e[type=marker,tag=a] run say 1",
        "execute if entity @e[type=marker,tag=a,limit=1] run say 2",
        "execute as @e[type=marker,tag=b] run say 3",
      ].join("\n"),
    });
    expect(r.lints.map((l) => l.rule)).toEqual(["repeated-selector"]);
    expect(r.lints[0].hint).toContain("2 lines");
  });

  it("repeated-selector: positional scans from different places aren't the same scan", () => {
    expect(
      rules({
        tick: [
          "execute at @a if entity @e[type=pig,distance=..3] run say 1",
          "execute at @e[type=cow] if entity @e[type=pig,distance=..3] run say 2",
        ].join("\n"),
      }),
    ).toEqual([]);
  });

  it("macro-score-set: a macro only feeding a score", () => {
    expect(rules({ other: "$scoreboard players set @s example $(Age)" })).toEqual(["macro-score-set"]);
    expect(rules({ other: "$scoreboard players set $(who) example 1" })).toEqual([]);
  });

  it("nbt-read hints if items for item NBT", () => {
    const r = lintsOf({ tick: "execute as @a[nbt={SelectedItem:{id:\"minecraft:apple\"}}] run say x" });
    expect(r.warnings[0].hint).toContain("if items");
  });

  it("nbt-write: only fields a command can set; slow clocks are fine", () => {
    expect(lintsOf({ tick: "data modify entity @s Item.count set value 10" }).lints[0].hint).toContain("item replace|modify");
    expect(lintsOf({ tick: "data modify entity @s Rotation[1] set value 0f" }).lints[0].hint).toContain("rotate");
    expect(rules({ tick: "data modify entity @s Motion set value [0d,1d,0d]" })).toEqual([]);
    expect(rules({ tick: "data merge entity @s {transformation:{scale:[1f,1f,1f]}}" })).toEqual([]);
    expect(rules({ tick: "execute if score t20 clock matches 0 run data modify entity @s Rotation set value [0f,0f]" })).toEqual([]);
  });

  it("nbt-write: indexed Pos writes suggest tp", () => {
    expect(lintsOf({ tick: "data modify entity @s Pos[0] set value 1d" }).lints[0].hint).toContain("`tp`");
  });

  it("guarded calls run 'up to' their period", () => {
    const r = lintsOf({
      tick: "execute if score #near x matches 1 run function p:leave\nfunction p:always",
      leave: "kill @e[tag=a]",
      always: "kill @e[tag=b]",
    });
    expect(r.lints.map((l) => [l.fn, !!l.guarded])).toEqual([["always", false], ["leave", true]]);
    expect(formatCostReport(r)).toContain("(up to every 1 tick(s))");
    // A clock gate isn't a condition - it already set the period.
    expect(lintsOf({ tick: "execute if score t20 clock matches 3 run function p:slow", slow: "kill @e[tag=a]" }).lints[0].guarded).toBeUndefined();
  });

  it("repeated-selector: when one line already calls a function as the scan, fold into it", () => {
    const r = lintsOf({
      tick: "execute as @e[type=husk,tag=m] run function p:one\nexecute as @e[type=husk,tag=m] on passengers run tag @s remove o",
    });
    expect(r.lints[0].hint).toContain("move the other scan(s) into `p:one`");
  });

  it("identical nbt reads in one function print once with a count", () => {
    const r = lintsOf({ tick: "execute store result score #a x run data get entity @s Rotation[0]\nexecute store result score #a x run data get entity @s Rotation[0]" });
    expect(r.warnings).toHaveLength(1);
    expect(formatCostReport(r)).toContain("(×2)");
  });

  it("collapses identical findings in one function into a count", () => {
    const r = lintsOf({ tick: "kill @e[tag=a]\nkill @e[tag=a]\nkill @e[tag=a]" });
    const missing = r.lints.filter((l) => l.rule === "missing-type");
    expect(missing).toHaveLength(1);
    expect(missing[0].count).toBe(3);
    expect(formatCostReport(r)).toContain("(+2 similar)");
  });

  it("poll-trigger: stat objectives polled per player", () => {
    const files = {
      load: "scoreboard objectives add kills minecraft.killed:minecraft.zombie",
      tick: "execute as @a run function p:per_player",
      per_player: "execute if score @s kills matches 1.. run say got one",
    };
    const r = lintsOf(files);
    expect(r.lints.map((l) => [l.rule, l.fn])).toEqual([["poll-trigger", "per_player"]]);
    expect(r.lints[0].hint).toContain("player_killed_entity");
    expect(rules({ ...files, load: "scoreboard objectives add kills dummy" })).toEqual([]);
    // carrot_on_a_stick has no trigger to suggest.
    expect(rules({ ...files, load: "scoreboard objectives add kills minecraft.used:minecraft.carrot_on_a_stick" })).toEqual([]);
  });

  it("poll-trigger: fixed-area checks, not relative ones", () => {
    expect(rules({ tick: "execute positioned 10 64 -3 as @a[distance=..4] run say in" })).toEqual(["poll-trigger"]);
    expect(rules({ tick: "execute as @a[x=0,y=60,z=0,dx=5,dy=5,dz=5] run say in" })).toEqual(["poll-trigger"]);
    expect(rules({ tick: "execute positioned ~ ~1 ~ as @a[distance=..4] run say in" })).toEqual([]);
    // Presence ("anyone there?") needs a poll: a per-player trigger can't see absence.
    expect(rules({ tick: "execute if entity @a[x=0,y=60,z=0,dx=5,dy=5,dz=5] run say someone" })).toEqual([]);
    expect(rules({ tick: "execute positioned 1 2 3 unless entity @a[distance=..6] run say nobody" })).toEqual([]);
  });

  it("poll-trigger: inventory polls, but not the held item", () => {
    expect(rules({ tick: "execute as @a if items entity @s container.* minecraft:diamond run say rich" })).toEqual([
      "poll-trigger",
    ]);
    expect(rules({ tick: "execute as @a if items entity @s weapon.mainhand minecraft:diamond run say hold" })).toEqual([]);
  });

  it("flags a dp.allow naming a function the pack doesn't have", () => {
    const r = lintsOf({ tick: "say hi" }, ["nbt-read", "mob/state/gone", "renamed"]);
    expect(r.staleAllows).toEqual([{ rule: "nbt-read", fn: "mob/state/gone" }]);
    expect(formatCostReport(r)).toContain('dp.allow("nbt-read", "mob/state/gone") names no function');
  });

  it("dp.allow silences a rule in a function and what it calls, and says so", () => {
    const files = { tick: "function p:hot", hot: "kill @e[tag=a]\nfunction p:child", child: "kill @e[tag=b]" };
    const r = lintsOf(files, ["missing-type", "hot", "tags span types"]);
    expect(r.lints).toEqual([]);
    expect(r.allowedLints.map((l) => l.fn)).toEqual(["child", "hot"]);
    expect(formatCostReport(r)).toContain("allowed missing-type: child (tags span types), hot (tags span types)");
    expect(lintsOf(files, ["nbt-write", "hot", "x"]).lints).toHaveLength(2);
  });
});
