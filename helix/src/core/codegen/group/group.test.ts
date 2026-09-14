import { expect, test } from "vitest";
import { Datapack, Id, Item, Slot, Objective, Path, Pos, Relation, ScoreTarget, Selector, Sort, Range } from "../../../index";
import type { FunctionContext } from "../../frontend/context";
import { v1_21_4 } from "../../../versions/profiles";
import { buildDatapack } from "../codegen";

/** Builds pack `p` with one function `f` and returns every function file. */
function build(body: (c: FunctionContext) => void, dp = new Datapack("p", v1_21_4)): Map<string, string> {
  dp.createFunction("f").build(body);
  buildDatapack(dp);
  return dp.files;
}

const self = () => Selector.self();
const aim = () => Selector.allEntities().tag("aim").limit(1);
const o = new Objective("o");
const holder = o.score(ScoreTarget("#n"));

/** Three `execute <clauses> run say …` lines. */
const says = (start: (c: FunctionContext) => ReturnType<FunctionContext["execute"]>) => (c: FunctionContext) => {
  for (const s of ["a", "b", "c"]) start(c).run((b) => b.say(s));
};

test("repeated `at @s` lines become one call", () => {
  const dp = new Datapack("p", v1_21_4, undefined, { debug: { sources: true } });
  const files = build((c) => {
    c.execute().at(self()).as(aim()).run((b) => {
      b.tag().add(self(), "tracked");
      b.say("enrolled");
    });
    c.execute().at(self()).storeResultScore(holder).run((b) => b.entity(aim()).get(Path.Entity.Pos.index(0), 100));
    c.execute().at(self()).run((b) => b.say("c"));
    c.say("done");
  }, dp);

  expect(Object.fromEntries(files)).toMatchInlineSnapshot(`
    {
      "f": "execute at @s run function p:zzz/f/group_0
    say done",
      "zzz/f/exec_0": "tag @s add tracked
    say enrolled",
      "zzz/f/group_0": "execute as @e[tag=aim,limit=1] run function p:zzz/f/exec_0
    execute store result score #n o run data get entity @e[tag=aim,limit=1] Pos[0] 100
    say c",
    }
  `);
  expect(dp.sourceMap.get("f")).toHaveLength(2);
  // A rebuild must leave it as it is.
  const before = new Map(files);
  buildDatapack(dp);
  expect(dp.files).toEqual(before);
});

test("a single-entity scan groups at two lines when every line but the last changes nothing", () => {
  const files = build((c) => {
    c.execute().as(aim()).run(() => holder.add(1));
    c.execute().as(aim()).run((b) => b.tag().remove(self(), "aim"));
  });
  expect(Object.fromEntries(files)).toMatchInlineSnapshot(`
    {
      "f": "execute as @e[tag=aim,limit=1] run function p:zzz/f/group_0",
      "zzz/f/group_0": "scoreboard players add #n o 1
    tag @s remove aim",
    }
  `);
});

test("a fork groups when every line only touches `@s`", () => {
  const files = build((c) => {
    c.execute().on(Relation.PASSENGERS).run((b) => b.tag().add(self().tag("rig"), "posed"));
    c.execute().on(Relation.PASSENGERS).run((b) => b.item().replaceEntityWith(self(), Slot.CONTENTS, Item.CROSSBOW));
    // `tag @e` reaches past `@s`, so it can't join.
    c.execute().on(Relation.PASSENGERS).run((b) => b.tag().add(Selector.allEntities(), "x"));
    c.execute().on(Relation.PASSENGERS).run((b) => b.tag().add(self(), "y"));
  });
  expect(Object.fromEntries(files)).toMatchInlineSnapshot(`
    {
      "f": "execute on passengers run function p:zzz/f/group_0
    execute on passengers run tag @e add x
    execute on passengers run tag @s add y",
      "zzz/f/group_0": "tag @s[tag=rig] add posed
    item replace entity @s contents with minecraft:crossbow",
    }
  `);
});

test("lines that could change what the prefix picks are left apart", () => {
  const mover = new Datapack("p", v1_21_4);
  const cases: Record<string, (c: FunctionContext) => void> = {
    // Each would group if its lines didn't share the flaw named.
    // Forks: grouping would reorder per-entity work.
    fork: says((c) => c.execute().as(Selector.allEntities().tag("x"))),
    random: says((c) => c.execute().as(Selector.random())),
    sortRandom: says((c) => c.execute().at(Selector.allEntities().limit(1).sort(Sort.RANDOM))),
    passengers: says((c) => c.execute().on(Relation.PASSENGERS)),
    scores: says((c) => c.execute().as(Selector.allEntities().score(o, Range.exactly(1)).limit(1))),
    // A condition belongs to its line, so it can't be shared.
    cond: says((c) => c.execute().ifScoreMatches(holder, Range.exactly(1))),
    returns: (c) => {
      c.execute().at(self()).run((b) => b.say("a"));
      c.execute().at(self()).run((b) => b.say("b"));
      c.execute().at(self()).run((b) => b.return_(1));
    },
    two: (c) => {
      c.execute().at(self()).run((b) => b.say("a"));
      c.execute().at(self()).run((b) => b.say("b"));
    },
    tp: (c) => {
      c.execute().at(self()).run((b) => b.say("a"));
      c.execute().at(self()).run((b) => b.teleport(self(), Pos.rel(0, 1, 0)));
      c.execute().at(self()).run((b) => b.say("c"));
    },
    // `tag` changes what `@e[tag=aim]` matches for the next line.
    tag: (c) => {
      c.execute().as(aim()).run((b) => b.tag().remove(Selector.allEntities(), "aim"));
      c.execute().as(aim()).run((b) => b.say("b"));
    },
    // A plugin command might do anything.
    native: (c) => {
      c.execute().at(self()).run((b) => b.say("a"));
      c.execute().at(self()).run((b) => b.native(Id("paper:hop"), self()));
      c.execute().at(self()).run((b) => b.say("c"));
    },
  };
  // Calls are followed: `mover` teleports through `deep`.
  const deep = mover.createFunction("zzz/deep");
  deep.build((c) => c.teleport(self(), Pos(0, 0, 0)));
  const callsMover = mover.createFunction("zzz/mover");
  callsMover.build((c) => {
    c.say("hi");
    c.execute().as(Selector.allPlayers()).run((b) => b.call(deep));
  });
  mover.createFunction("call").build((c) => {
    c.execute().at(self()).run((b) => b.say("a"));
    c.execute().at(self()).run((b) => b.call(callsMover));
    c.execute().at(self()).run((b) => b.say("c"));
  });
  const withNative = new Datapack("p", v1_21_4, "paper");
  for (const [name, body] of Object.entries(cases)) (name === "native" ? withNative : mover).createFunction(name).build(body);
  buildDatapack(mover);
  buildDatapack(withNative);

  const out = Object.fromEntries(
    [...Object.keys(cases), "call"].map((n) => [n, (n === "native" ? withNative : mover).files.get(n)]),
  );
  expect(out).toMatchInlineSnapshot(`
    {
      "call": "execute at @s run say a
    execute at @s run function p:zzz/mover
    execute at @s run say c",
      "cond": "execute if score #n o matches 1 run say a
    execute if score #n o matches 1 run say b
    execute if score #n o matches 1 run say c",
      "fork": "execute as @e[tag=x] run say a
    execute as @e[tag=x] run say b
    execute as @e[tag=x] run say c",
      "native": "execute at @s run say a
    execute at @s run paper:hop @s
    execute at @s run say c",
      "passengers": "execute on passengers run say a
    execute on passengers run say b
    execute on passengers run say c",
      "random": "execute as @r run say a
    execute as @r run say b
    execute as @r run say c",
      "returns": "execute at @s run say a
    execute at @s run say b
    execute at @s run return 1",
      "scores": "execute as @e[scores={o=1},limit=1] run say a
    execute as @e[scores={o=1},limit=1] run say b
    execute as @e[scores={o=1},limit=1] run say c",
      "sortRandom": "execute at @e[limit=1,sort=random] run say a
    execute at @e[limit=1,sort=random] run say b
    execute at @e[limit=1,sort=random] run say c",
      "tag": "execute as @e[tag=aim,limit=1] run tag @e remove aim
    execute as @e[tag=aim,limit=1] run say b",
      "tp": "execute at @s run say a
    execute at @s run teleport @s ~ ~1 ~
    execute at @s run say c",
      "two": "execute at @s run say a
    execute at @s run say b",
    }
  `);
});

test("a blocking line ends one group and the rest still groups", () => {
  const files = build((c) => {
    c.execute().at(self()).run((b) => b.say("a"));
    c.execute().at(self()).run((b) => b.teleport(self(), Pos.rel(0, 1, 0)));
    for (const s of ["b", "c", "d"]) c.execute().at(self()).run((b) => b.say(s));
  });
  expect(files.get("f")).toMatchInlineSnapshot(`
    "execute at @s run say a
    execute at @s run teleport @s ~ ~1 ~
    execute at @s run function p:zzz/f/group_0"
  `);
});

test("`optimize.group: false` leaves repeated prefixes alone", () => {
  const lines = (group?: boolean) =>
    build(says((c) => c.execute().at(self())), new Datapack("p", v1_21_4, undefined, { optimize: { group } })).get("f");
  expect(lines()).toBe("execute at @s run function p:zzz/f/group_0");
  expect(lines(false)).toBe(["a", "b", "c"].map((s) => `execute at @s run say ${s}`).join("\n"));
});
