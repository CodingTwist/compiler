import "reflect-metadata";
import { describe, it, expect } from "vitest";
// Import from the "helix" barrel - the same specifier twine's src uses - so the
// entity concepts built here share one class identity with the summon handler
// (a deep `helix/dist/...` path loads a second copy and breaks `instanceof`).
import { buildDatapack, Component, Pos, Wither } from "helix";
import { Module } from "../src/module.decorator";
import { DatapackFactory } from "../src/factory";
import { defineBoss } from "../src/boss";

function compile(root: new () => object) {
  const dp = DatapackFactory.create(root as never, { name: "test", env: "dev" });
  const files = buildDatapack(dp);
  return {
    all: [...files.values()].join("\n"),
    file: (suffix: string) => [...files].find(([p]) => p.endsWith(suffix))?.[1],
  };
}

/** A two-phase king with two weighted abilities in phase two. */
const king = () =>
  defineBoss(Wither({ customName: "Bone King" }), Pos(0, 70, 0))
    .arena({ kind: "region", center: [0, 70, 0], radius: 30 })
    .bossbar(Component("Bone King"), "purple")
    .phase("one")
    .ability("slam", { cooldown: 60, weight: 3, body: (ctx) => ctx.say("slam") })
    .phase("two", { at: 50, bar: { name: Component("Enraged"), color: "red" } })
    .ability("slam", { cooldown: 60, weight: 3, body: (ctx) => ctx.say("slam") })
    .ability("beam", { cooldown: 40, body: (ctx) => ctx.say("beam") })
    .onVictory((ctx) => ctx.say("won"))
    .onDefeat((ctx) => ctx.say("lost"));

function build() {
  @Module({ name: "root", imports: [king().toModule("king")] })
  class Root {}
  return compile(Root);
}

describe("defineBoss", () => {
  it("mirrors the mob's real health into a percentage and onto the bar", () => {
    const { all } = build();
    // Max is read once at spawn (full health, scale 1); each poll reads scale 100
    // and divides, so the score is a 0..100 percent of *this* mob's real max.
    expect(all).toContain(
      "store result score #king.max king run data get entity @e[tag=king,limit=1] Health 1",
    );
    expect(all).toContain(
      "store result score #king.hp king run data get entity @e[tag=king,limit=1] Health 100",
    );
    expect(all).toContain("scoreboard players operation #king.hp king /= #king.max king");
    expect(all).toContain(
      "store result bossbar test:king value run scoreboard players get #king.hp king",
    );
  });

  it("tags the summoned mob without dropping the author's own NBT", () => {
    const { all } = build();
    expect(all).toContain("summon minecraft:wither 0 70 0 ");
    expect(all).toContain('Tags:["king"]');
    expect(all).toContain("Bone King");
  });

  it("enters each phase at its health threshold", () => {
    const { all } = build();
    expect(all).toContain("if score #king.hp king matches ..50");
    // No `initial()` seeding: the fight is entered only via activate, which is
    // what makes it repeatable.
    expect(all).toContain("king/enter_first");
  });

  it("sums only the off-cooldown abilities' weights before rolling", () => {
    const two = build().file("king/two/pick.mcfunction")!;
    const dispatch = build().file("king/dispatch.mcfunction")!;
    const phaseTwo = build().all;

    expect(phaseTwo).toContain("scoreboard players set #king.total king 0");
    expect(phaseTwo).toContain(
      "if score #king.cd.two.slam king matches ..0 run scoreboard players add #king.total king 3",
    );
    expect(phaseTwo).toContain(
      "if score #king.cd.two.beam king matches ..0 run scoreboard players add #king.total king 1",
    );
    // Everything on cooldown => total 0 => the guard fails and nothing rolls.
    expect(phaseTwo).toContain("if score #king.total king matches 1..");
    expect(dispatch).toBeTruthy();
    expect(two).toBeTruthy();
  });

  it("rolls the full int range modulo the live total, then walks cumulative weights", () => {
    const pick = build().file("king/two/pick.mcfunction")!;
    // `random value` needs a build-time literal range, so the live total can only
    // enter via the modulo. This is the one place a RandomValueNode is fed to an
    // execute chain anywhere in the stack - if it stops inlining, no roll happens.
    expect(pick).toContain("store result score #king.roll king run random value 0..2147483647");
    expect(pick).toContain("scoreboard players operation #king.roll king %= #king.total king");
    expect(pick).toContain("scoreboard players add #king.roll king 1");
    expect(pick).toContain("scoreboard players set #king.pick king 0");
    // Only an unpicked, off-cooldown ability is even tried.
    expect(pick).toContain(
      "if score #king.pick king matches 0 if score #king.cd.two.slam king matches ..0 run function test:king/two/try_slam",
    );

    const trySlam = build().file("king/two/try_slam.mcfunction")!;
    expect(trySlam).toContain("scoreboard players remove #king.roll king 3");
    expect(trySlam).toContain("if score #king.roll king matches ..0 run function test:king/two/slam");

    const slam = build().file("king/two/slam.mcfunction")!;
    expect(slam).toContain("scoreboard players set #king.pick king 1");
    expect(slam).toContain("scoreboard players set #king.cd.two.slam king 60");
    expect(slam).toContain("say slam");
  });

  it("declares abilities per phase, so phase one cannot fire phase two's beam", () => {
    const { all } = build();
    expect(all).toContain("test:king/one/try_slam");
    expect(all).not.toContain("test:king/one/try_beam");
  });

  it("treats the entity being gone as death, and cleans up so the fight repeats", () => {
    const { all, file } = build();
    expect(all).toContain("unless entity @e[tag=king,limit=1] run function test:king/victory");

    const cleanup = file("king/cleanup.mcfunction")!;
    expect(cleanup).toContain("kill @e[tag=king]");
    expect(cleanup).toContain("bossbar remove test:king");
    expect(cleanup).toContain("scoreboard players set #king.live king 0");
    expect(cleanup).toContain("scoreboard players set #king.cd.two.beam king 0");
    expect(cleanup).toContain("tag @a[tag=king.p] remove king.p");

    // Victory rewards each participant, then resets.
    const victory = file("king/victory.mcfunction")!;
    expect(victory).toContain("as @a[tag=king.p]");
    expect(victory).toContain("function test:king/cleanup");
  });

  it("pays for the boss entity scan once per poll, not once per command", () => {
    // The whole live body has to hang off ONE `if entity`; guarding each command
    // separately re-scans every loaded entity ten times a poll, which is the exact
    // cost the area gating exists to avoid.
    const { all } = build();
    expect(all.split("if entity @e[tag=king,limit=1]").length - 1).toBe(1);
  });

  it("recomputes arena membership each poll and binds the bar to it", () => {
    const { all } = build();
    expect(all).toContain("tag @a[tag=king.p] remove king.p");
    expect(all).toContain("positioned 0 70 0 run tag @a[distance=..30] add king.p");
    expect(all).toContain("bossbar set test:king players @a[tag=king.p]");
  });

  it("only mourns a defeat while the boss is still alive", () => {
    const deactivate = build().file("king/deactivate.mcfunction")!;
    expect(deactivate).toContain("if score #king.live king matches 1");
    expect(deactivate).toContain("function test:king/defeat");
  });

  it("rejects a boss whose arena has no geometry to find participants in", () => {
    expect(() =>
      defineBoss(Wither({}), Pos(0, 70, 0))
        .arena({ kind: "score", objective: "q", target: "#s", equals: 1 })
        .phase("one")
        .toModule("king"),
    ).toThrow(/score.*trigger/s);
  });

  it("rejects an ability with no phase to belong to", () => {
    expect(() =>
      defineBoss(Wither({}), Pos(0, 70, 0)).ability("slam", { cooldown: 1, body: () => {} }),
    ).toThrow(/before any phase/);
  });
});
