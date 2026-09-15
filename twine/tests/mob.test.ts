import "reflect-metadata";
import { describe, it, expect } from "vitest";
// From the "helix" barrel, not a deep dist path - see the note in boss.test.ts.
import {
  Block,
  buildDatapack,
  Display,
  Husk,
  Item,
  Range,
  Selector,
  quat,
  quatFromTo,
  v26_2,
} from "helix";
import type { VersionProfile } from "helix";
import { Module } from "../src/core/module.decorator";
import { DatapackFactory } from "../src/core/factory";
import { defineMob } from "../src/mob/builder";
import { DIFFICULTY_IDS, setDifficulty } from "../src/core/difficulty";
import type { Detector } from "helix";

function build(version?: VersionProfile) {
  const rig = Display(Block.STONE)
    .add(Block.STONE, { translation: [0, 1, 0] })
    .hitbox(1, 1);
  const mob = defineMob(Husk({ silent: true }), rig)
    .relayHits(4)
    .toModule("sentinel");

  @Module({ name: "root", imports: [mob] })
  class Root {}

  const dp = DatapackFactory.create(Root as never, {
    name: "test",
    env: "dev",
    version,
  });
  return [...buildDatapack(dp).values()].join("\n");
}

describe("defineMob", () => {
  it("summons the mob and its rig, then mounts one on the other", () => {
    const all = build();
    expect(all).toContain(
      `summon minecraft:husk ~ ~ ~ {Silent:1b,Tags:["sentinel","sentinel.new"]}`,
    );
    expect(all).toContain(
      `Tags:["sentinel_rig","sentinel_rig_0","sentinel.new"]`,
    );
    expect(all).toContain(
      "execute as @e[distance=..1,tag=sentinel_rig_0,tag=sentinel.new,type=minecraft:block_display] run ride @s mount @e[distance=..1,tag=sentinel,tag=sentinel.new,limit=1,type=minecraft:husk]",
    );
    expect(all).toContain(
      "tag @e[distance=..1,tag=sentinel,tag=sentinel.new,type=minecraft:husk] remove sentinel.new",
    );
    expect(all).toContain(
      "execute as @e[distance=..1,tag=sentinel,tag=sentinel.new,limit=1,type=minecraft:husk] on passengers run tag @s remove sentinel.new",
    );
  });

  it("sweeps rigs whose mob died - a killed vehicle only dismounts its riders", () => {
    const all = build();
    expect(all).toContain(
      "tag @e[tag=sentinel_rig_0,type=minecraft:block_display] add sentinel.orphan",
    );
    // Claimed inside wake_one, so the husks are scanned once, not twice.
    expect(all).toContain(
      "execute on passengers run tag @s remove sentinel.orphan",
    );
    expect(all).toContain(
      "execute as @e[tag=sentinel_rig_0,tag=sentinel.orphan,type=minecraft:block_display] run function test:sentinel/zzz/kill_rig",
    );
    // The rig root's own passengers (children + hitbox) have to be killed first.
    expect(all).toContain("execute on passengers run kill @s");
  });

  it("relays a hit on the hitbox down onto the mob, and copies the mob's yaw up", () => {
    const all = build();
    // `on attacker` is the hit test, so no NBT is read until there is a hit.
    expect(all).toContain(
      "execute on passengers on passengers if entity @s[tag=sentinel_rig_hitbox] if function test:sentinel/zzz/attacked run function test:sentinel/zzz/relay_hit",
    );
    expect(all).toContain("execute on attacker run return 1");
    expect(all).toContain(
      "execute on vehicle on vehicle run damage @s 4\ndata remove entity @s attack",
    );
    expect(all).not.toContain("nbt=");
    // Exactly the rig's own vehicle, and yaw only - a copied pitch tilts the model.
    expect(all).toContain(
      "execute on passengers if entity @s[tag=sentinel_rig_0] run function test:sentinel/zzz/face_one",
    );
    expect(all).toContain(
      "execute on vehicle run data modify entity @e[tag=sentinel_rig_0,tag=sentinel.cur,limit=1,type=minecraft:block_display] Rotation[0] set from entity @s Rotation[0]",
    );
    // ...and on down to the members riding the root, which keep their own rotation.
    expect(all).toContain(
      "execute on passengers run data modify entity @s Rotation[0] set from entity @e[tag=sentinel_rig_0,tag=sentinel.cur,limit=1,type=minecraft:block_display] Rotation[0]",
    );
  });

  it("turns the rig with rotate on 1.21.2+, reading no NBT", () => {
    const all = build(v26_2);
    expect(all).toContain(
      "execute rotated as @s rotated ~ 0 on passengers if entity @s[tag=sentinel_rig_0] positioned as @s run function test:sentinel/zzz/face_one",
    );
    expect(all).toContain(
      "rotate @s facing ^ ^ ^1\nexecute on passengers run rotate @s facing ^ ^ ^1",
    );
    expect(all).not.toContain("Rotation[0]");
  });

  it("raises a gesture's members and interpolates them back to their rest pose", () => {
    const rig = Display(Block.STONE)
      .add(Block.STONE, { translation: [0, 1, 0] })
      .offset([0, -2, 0]);
    const mob = defineMob(Husk({ silent: true }), rig)
      .gesture("swing", {
        members: [1],
        pivot: [0, 2, 0],
        rotate: quat("x", -90),
        when: (c) =>
          c.ifEntity(Selector.allPlayers().distance(new Range(undefined, 3))),
      })
      .toModule("sentinel");

    @Module({ name: "root", imports: [mob] })
    class Root {}

    const all = [
      ...buildDatapack(
        DatapackFactory.create(Root as never, { name: "test", env: "dev" }),
      ).values(),
    ].join("\n");

    // Raised: instant, about the pivot *in the offset space the members live in*
    // (pivot y 2 - offset 2 = 0, so the member hanging at y -1 swings out to z +1).
    expect(all).toContain(
      "execute on passengers on passengers run data merge entity @s[tag=sentinel_rig_1] {transformation:{left_rotation:[-0.707107f,0.0f,0.0f,0.707107f],right_rotation:[0.0f,0.0f,0.0f,1.0f],scale:[1.0f,1.0f,1.0f],translation:[0.0f,0.0f,1.0f]},start_interpolation:0,interpolation_duration:0}",
    );
    // ...and the fall lands back on exactly the summoned pose, or the member
    // creeps a little further from home with every gesture.
    const rest =
      "transformation:{left_rotation:[0.0f,0.0f,0.0f,1.0f],right_rotation:[0.0f,0.0f,0.0f,1.0f],scale:[1.0f,1.0f,1.0f],translation:[0.0f,-1.0f,0.0f]}";
    expect(all).toContain(`${rest},Tags:["sentinel_rig","sentinel_rig_1"]`);
    expect(all).toContain(
      `run data merge entity @s[tag=sentinel_rig_1] {${rest},start_interpolation:0,interpolation_duration:4}`,
    );
    // Gated on its own cooldown, which only counts down for mobs that have one.
    expect(all).toContain(
      "execute unless entity @s[tag=sentinel.finishing] unless score @s sentinel.swing matches 1.. if entity @a[distance=..3,limit=1] run function test:sentinel/swing",
    );
    expect(all).toContain(
      "execute if score @s sentinel.swing matches 1.. run scoreboard players remove @s sentinel.swing 1",
    );
  });

  it("eases a rise in and holds it, pushing the sequence's step clock back", () => {
    const rig = Display(Block.STONE).add(Block.STONE, {
      translation: [0, 0, 1],
    });
    const mob = defineMob(Husk({ silent: true }), rig)
      .gesture("whirl", {
        members: [1],
        pivot: [0, 0, 0],
        rotate: [quat("y", 90), quat("y", 180)],
        tilt: quatFromTo([0, -1, 0], [0, 0, 1]),
        rise: 3,
        cooldown: 20,
      })
      .toModule("sentinel");

    @Module({ name: "root", imports: [mob] })
    class Root {}

    const all = [
      ...buildDatapack(
        DatapackFactory.create(Root as never, { name: "test", env: "dev" }),
      ).values(),
    ].join("\n");

    // The first pose interpolates over `rise` rather than snapping, and carries the
    // tilt (x -90) composed onto the step's own y 90.
    expect(all).toContain(
      "run data merge entity @s[tag=sentinel_rig_1] {transformation:{left_rotation:[-0.5f,0.5f,0.5f,0.5f],right_rotation:[0.0f,0.0f,0.0f,1.0f],scale:[1.0f,1.0f,1.0f],translation:[1.0f,0.0f,0.0f]},start_interpolation:0,interpolation_duration:3}",
    );
    // Step 1 waits out the 2-poll hold: 20 - 2 - 1, not 20 - 1.
    expect(all).toContain(
      "execute if score @s sentinel.whirl matches 17 run return run function test:sentinel/zzz/whirl_step_1",
    );
    expect(all).not.toContain("sentinel.whirl matches 19 ");
    // ...and so does the fall home, at 20 - 2 - 2.
    expect(all).toContain(
      "execute if score @s sentinel.whirl matches 16 run return run function test:sentinel/zzz/whirl_step_2",
    );
    // One dispatch picks the step; no member line re-tests the clock.
    expect(all).not.toContain("@s[scores=");
  });

  it("lands a delayed hit partway through the swing, off the mob's own clock", () => {
    const mob = defineMob(Husk({ silent: true }), Display(Block.STONE))
      .gesture("whirl", {
        members: [0],
        pivot: [0, 0, 0],
        rotate: [quat("y", 90), quat("y", 180)],
        cooldown: 20,
        fireAfter: 6,
        onFire: (ctx) => ctx.say("hit"),
      })
      .toModule("sentinel");

    @Module({ name: "root", imports: [mob] })
    class Root {}

    const files = buildDatapack(
      DatapackFactory.create(Root as never, { name: "test", env: "dev" }),
    );
    const all = [...files.values()].join("\n");

    // The hit moved out of the gesture function into its own, called from the poll
    // by whichever mobs are exactly 6 ticks past their raise.
    expect(all).toContain(
      "execute if score @s sentinel.whirl matches 14 run say hit",
    );
    expect(
      [...files.keys()].find((k) => k.endsWith("whirl.mcfunction")),
    ).toBeDefined();
    expect(
      files.get([...files.keys()].find((k) => k.endsWith("whirl.mcfunction"))!),
    ).not.toContain("say hit");
  });

  it("gives each gesture its own clock, so an idle one can't gate the rest", () => {
    const mob = defineMob(Husk({ silent: true }), Display(Block.STONE))
      .gesture("bob", {
        members: [0],
        pivot: [0, 0, 0],
        rotate: quat("x", 8),
        cooldown: 10,
      })
      .gesture("swing", {
        members: [0],
        pivot: [0, 0, 0],
        rotate: quat("x", -90),
        when: (c) => c.ifEntity(Selector.allPlayers()),
      })
      .toModule("sentinel");

    @Module({ name: "root", imports: [mob] })
    class Root {}

    const all = [
      ...buildDatapack(
        DatapackFactory.create(Root as never, { name: "test", env: "dev" }),
      ).values(),
    ].join("\n");

    // The swing waits on its own countdown only - on the shared one it would be
    // starved by every bob.
    expect(all).toContain("unless score @s sentinel.swing matches 1..");
    expect(all).not.toContain(
      "unless score @s sentinel.bob matches 1.. if entity @a[limit=1]",
    );
  });

  it("puts back on a later beat what the shot spent", () => {
    const mob = defineMob(Husk({ silent: true }), Display(Block.STONE))
      .gesture("fire", {
        members: [0],
        pivot: [0, 0, 0],
        rotate: quat("x", -14),
        cooldown: 30,
        recoverAfter: 24,
        onFire: (ctx) => ctx.say("shot"),
        onRecover: (ctx) => ctx.say("reloaded"),
      })
      .toModule("sentinel");

    @Module({ name: "root", imports: [mob] })
    class Root {}

    const files = buildDatapack(
      DatapackFactory.create(Root as never, { name: "test", env: "dev" }),
    );
    const all = [...files.values()].join("\n");

    expect(all).toContain(
      "execute if score @s sentinel.fire matches 6 run say reloaded",
    );
  });

  it("costs a score check per poll until a player is near", () => {
    const dp = DatapackFactory.create(
      (() => {
        const mob = defineMob(Husk({}), Display(Block.STONE))
          .onTick((c) => c.say("mine"))
          .toModule("sentinel", { tickEvery: 1, wakeRange: 30 });
        @Module({ name: "root", imports: [mob] })
        class Root {}
        return Root;
      })() as never,
      { name: "test", env: "dev" },
    );
    const files = buildDatapack(dp);
    const fn = (n: string) =>
      files.get(
        [...files.keys()].find((k) => k.endsWith(`/${n}.mcfunction`))!,
      )!;
    expect(fn("sentinel/tick")).toBe(
      [
        "execute if score #awake sentinel.awake matches 1.. as @e[tag=sentinel,tag=sentinel.awake,type=minecraft:husk] at @s run function test:sentinel/zzz/tick_one",
        "execute if score t20 clock matches 0 run function test:sentinel/zzz/wake",
      ].join("\n"),
    );
    // One reset scan, one near scan per player - each a call, not a scan per tag.
    expect(fn("wake").split("\n").slice(1, 3)).toEqual([
      "execute as @e[tag=sentinel,type=minecraft:husk] run function test:sentinel/zzz/wake_one",
      "execute at @a as @e[distance=..30,tag=sentinel,type=minecraft:husk] run function test:sentinel/zzz/wake_near",
    ]);
    expect(
      fn("wake").match(/@e\[tag=sentinel,type=minecraft:husk\]/g),
    ).toHaveLength(1);
    expect(fn("tick_one")).not.toContain("@e");
    // Walked away mid-gesture: kept awake to finish it, but a looping one can't re-fire.
    expect(fn("wake_near")).toBe(
      "tag @s add sentinel.awake\ntag @s remove sentinel.finishing",
    );
    expect(fn("tick_one")).toContain("say mine");
  });

  it("rejects a sequence whose cooldown can't fit its rise as well as its steps", () => {
    const build3 = (rise: number) => () => {
      const mob = defineMob(Husk({}), Display(Block.STONE))
        .gesture("whirl", {
          members: [0],
          pivot: [0, 0, 0],
          rotate: [quat("y", 90), quat("y", 180)],
          rise,
          cooldown: 3,
        })
        .toModule("sentinel");

      @Module({ name: "root", imports: [mob] })
      class Root {}

      DatapackFactory.create(Root as never, { name: "test", env: "dev" });
    };
    // Two steps inside a cooldown of 3 is fine until the rise wants polls too.
    expect(build3(0)).not.toThrow();
    expect(build3(4)).toThrow(/rise hold/);
  });
});

describe("mob preview", () => {
  it("times a sequence's writes: rise, held steps, then home", () => {
    const mob = defineMob(Husk({}), Display.item(Item.MACE))
      .gesture("smash", {
        members: [0],
        pivot: [0, 0, 0],
        rotate: [quat("x", -60), quat("x", 30), quat("x", 110)],
        rise: 10,
        fall: 6,
        cooldown: 30,
      })
      .toModule("m", { tickEvery: 2 });
    const [g] = mob.preview().gestures;
    // hold = rise - 1 = 9 polls, so step 1 lands on poll 10 (tick 20).
    expect(g.writes.map((w) => [w.tick, w.duration])).toEqual([
      [0, 10],
      [20, 2],
      [22, 2],
      [24, 6],
    ]);
    expect(g.writes[3].poses[0]).toEqual({});
  });

  it("drops a one-step gesture on the next poll", () => {
    const mob = defineMob(Husk({}), Display.item(Item.MACE))
      .gesture("jab", { members: [0], pivot: [0, 0, 0], rotate: quat("x", 45) })
      .toModule("m", { tickEvery: 2 });
    expect(
      mob.preview().gestures[0].writes.map((w) => [w.tick, w.duration]),
    ).toEqual([
      [0, 0],
      [2, 4],
    ]);
  });

  it("holds the last pose for a linger before the fall", () => {
    const mob = defineMob(Husk({}), Display.item(Item.MACE))
      .gesture("slam", {
        members: [0],
        pivot: [0, 0, 0],
        rotate: quat("z", 90),
        rise: 5,
        linger: 10,
        fall: 3,
        cooldown: 30,
      })
      .toModule("m", { tickEvery: 1 });
    // hold 4 + 1 step + linger 10: home on poll 15.
    expect(
      mob.preview().gestures[0].writes.map((w) => [w.tick, w.duration]),
    ).toEqual([
      [0, 5],
      [15, 3],
    ]);
  });
});

describe("mob checks written once", () => {
  const files = (mob: { name: string }) => {
    @Module({ name: "root", imports: [mob as never] })
    class Root {}
    const out = buildDatapack(
      DatapackFactory.create(Root as never, { name: "test", env: "dev" }),
    );
    return (n: string) =>
      out.get([...out.keys()].find((k) => k.endsWith(`/${n}.mcfunction`))!)!;
  };

  it("puts every gesture trigger behind one finishing check", () => {
    const near: Detector = (c) => c.ifEntity(Selector.allPlayers());
    const fn = files(
      defineMob(Husk({}), Display(Block.STONE))
        .gesture("a", {
          members: [0],
          pivot: [0, 0, 0],
          rotate: quat("x", 8),
          when: near,
        })
        .gesture("b", {
          members: [0],
          pivot: [0, 0, 0],
          rotate: quat("x", 9),
          when: near,
        })
        .toModule("sentinel"),
    );
    expect(fn("tick_one").match(/sentinel\.finishing/g)).toHaveLength(1);
    expect(fn("tick_one")).toContain(
      "execute unless entity @s[tag=sentinel.finishing] run function test:sentinel/zzz/triggers",
    );
    expect(fn("triggers")).not.toContain("finishing");
  });

  it("runs a mob's states from one dispatch, timed ones on a clock that keeps it awake", () => {
    const fn = files(
      defineMob(Husk({}), Display(Block.STONE))
        .states({
          up: {
            polls: 5,
            onEnter: (c) => c.say("lift"),
            tick: (c) => c.say("rising"),
            then: "down",
          },
          down: {
            tick: (c, _dp, mob) =>
              c
                .execute()
                .ifEntity(Selector.self().tag("hit"))
                .run((b) => mob.leave(b)),
          },
        })
        .gesture("jump", {
          members: [0],
          pivot: [0, 0, 0],
          rotate: quat("x", 8),
          when: (c) => c.ifEntity(Selector.allPlayers()),
          onFire: (c, _dp, mob) => mob.enter(c, "up"),
        })
        .toModule("sentinel"),
    );
    expect(fn("jump")).toContain("function test:sentinel/enter/up");
    expect(fn("enter/up")).toBe(
      [
        "scoreboard players set @s sentinel.state 1",
        "scoreboard players set @s sentinel.state_t 5",
        "say lift",
      ].join("\n"),
    );
    // An untimed state zeroes the clock, or a stale count keeps the mob awake in it.
    expect(fn("enter/down")).toContain(
      "scoreboard players set @s sentinel.state_t 0",
    );
    expect(fn("tick_one")).toContain(
      "execute if score @s sentinel.state matches 1.. run function test:sentinel/zzz/state",
    );
    expect(fn("state")).toBe(
      [
        "scoreboard players operation #sentinel_state sentinel.state = @s sentinel.state",
        "execute if score #sentinel_state sentinel.state matches 1 run return run function test:sentinel/zzz/state/up",
        "execute if score #sentinel_state sentinel.state matches 2 run return run execute if entity @s[tag=hit] run scoreboard players set @s sentinel.state 0",
      ].join("\n"),
    );
    expect(fn("state/up")).toBe(
      [
        "scoreboard players remove @s sentinel.state_t 1",
        "say rising",
        "execute if score @s sentinel.state matches 1 if score @s sentinel.state_t matches ..0 run function test:sentinel/enter/down",
      ].join("\n"),
    );
    expect(fn("wake_one")).toContain(
      "execute if score @s sentinel.state_t matches 1.. run function test:sentinel/zzz/wake_finish",
    );
  });
});

describe("difficulty", () => {
  function scaled() {
    const mob = defineMob(Husk({}), Display(Block.STONE))
      .onDifficulty((ctx, _dp, level) => ctx.say(`now ${level}`))
      .onTick((ctx, _dp, m) =>
        m.byDifficulty(ctx, (c, level) =>
          c.damage(Selector.nearest(), DIFFICULTY_IDS[level] * 4),
        ),
      )
      .toModule("brute");
    @Module({ name: "root", imports: [mob] })
    class Root {
      onLoad() {
        setDifficulty("hard");
      }
    }
    const dp = DatapackFactory.create(Root as never, {
      name: "test",
      version: v26_2,
    });
    return [...buildDatapack(dp).values()].join("\n");
  }

  it("seeds the level from /difficulty only while unset, then lets the pack set it", () => {
    const all = scaled();
    expect(all).toContain(
      "execute unless score #level twine.difficulty matches 1.. store result score #level twine.difficulty run difficulty",
    );
    expect(all).toContain("scoreboard players set #level twine.difficulty 3");
  });

  it("runs onDifficulty at summon and on live mobs when the level changes", () => {
    const all = scaled();
    // Grouped with the rig's tag removal under one scan for the fresh mob.
    expect(all).toContain(
      "execute as @e[distance=..1,tag=brute,tag=brute.new,limit=1,type=minecraft:husk] run function test:brute/zzz/summon/group_0",
    );
    expect(all).toContain(
      "function test:brute/zzz/on_difficulty\nexecute on passengers run tag @s remove brute.new",
    );
    expect(all).toContain("matches 1 run return run say now easy");
    expect(all).toContain("say now hard");
    expect(all).toContain(
      "execute unless score #level twine.difficulty = #applied brute.awake run function test:brute/zzz/rescale",
    );
    expect(all).toMatch(
      /execute as @e\[tag=brute,type=minecraft:husk\] run function test:brute\/zzz\/on_difficulty\n/,
    );
  });

  it("builds a byDifficulty body once per level, in its own function", () => {
    const all = scaled();
    // The dispatch returns, which would cut off the rest of the caller.
    expect(all).toContain("function test:brute/zzz/by_difficulty_0\n");
    expect(all).toContain("damage @p 4");
    expect(all).toContain("damage @p 12");
  });

  it("emits no difficulty plumbing for a mob without onDifficulty", () => {
    expect(build()).not.toContain("#applied");
  });
});
