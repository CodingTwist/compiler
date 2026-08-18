import "reflect-metadata";
import { describe, it, expect } from "vitest";
// From the "helix" barrel, not a deep dist path - see the note in boss.test.ts.
import { Block, buildDatapack, Display, Husk, Range, Selector, quat } from "helix";
import { Module } from "../src/module.decorator";
import { DatapackFactory } from "../src/factory";
import { defineMob } from "../src/mob";

function build() {
  const rig = Display(Block.STONE).add(Block.STONE, { translation: [0, 1, 0] }).hitbox(1, 1);
  const mob = defineMob(Husk({ silent: true }), rig).relayHits(4).toModule("sentinel");

  @Module({ name: "root", imports: [mob] })
  class Root {}

  const dp = DatapackFactory.create(Root as never, { name: "test", env: "dev" });
  return [...buildDatapack(dp).values()].join("\n");
}

describe("defineMob", () => {
  it("summons the mob and its rig, then mounts one on the other", () => {
    const all = build();
    expect(all).toContain(`summon minecraft:husk ~ ~ ~ {Silent:1b,Tags:["sentinel","sentinel.new"]}`);
    expect(all).toContain(`Tags:["sentinel_rig","sentinel_rig_0","sentinel.new"]`);
    expect(all).toContain(
      "execute as @e[tag=sentinel_rig_0,tag=sentinel.new] run ride @s mount @e[tag=sentinel,tag=sentinel.new,limit=1]",
    );
    expect(all).toContain("tag @e[tag=sentinel.new] remove sentinel.new");
  });

  it("sweeps rigs whose mob died - a killed vehicle only dismounts its riders", () => {
    const all = build();
    expect(all).toContain("tag @e[tag=sentinel_rig_0] add sentinel.orphan");
    expect(all).toContain(
      "execute as @e[tag=sentinel] on passengers run tag @s remove sentinel.orphan",
    );
    expect(all).toContain(
      "execute as @e[tag=sentinel_rig_0,tag=sentinel.orphan] run function test:sentinel/kill_rig",
    );
    // The rig root's own passengers (children + hitbox) have to be killed first.
    expect(all).toContain("execute on passengers run kill @s");
  });

  it("relays a hit on the hitbox down onto the mob, and copies the mob's yaw up", () => {
    const all = build();
    expect(all).toContain(
      "execute as @e[tag=sentinel_rig_hitbox,nbt={attack:{}}] on vehicle on vehicle run damage @s 4",
    );
    // Exactly the rig's own vehicle, and yaw only - a copied pitch tilts the model.
    expect(all).toContain("execute as @e[tag=sentinel_rig_0] run function test:sentinel/face_one");
    expect(all).toContain(
      "execute on vehicle run data modify entity @e[tag=sentinel.cur,limit=1] Rotation[0] set from entity @s Rotation[0]",
    );
    // ...and on down to the members riding the root, which keep their own rotation.
    expect(all).toContain(
      "execute on passengers run data modify entity @s Rotation[0] set from entity @e[tag=sentinel.cur,limit=1] Rotation[0]",
    );
  });

  it("raises a gesture's members and interpolates them back to their rest pose", () => {
    const rig = Display(Block.STONE).add(Block.STONE, { translation: [0, 1, 0] }).offset([0, -2, 0]);
    const mob = defineMob(Husk({ silent: true }), rig)
      .gesture("swing", {
        members: [1],
        pivot: [0, 2, 0],
        rotate: quat("x", -90),
        when: (c) => c.ifEntity(Selector.allPlayers().distance(new Range(undefined, 3))),
      })
      .toModule("sentinel");

    @Module({ name: "root", imports: [mob] })
    class Root {}

    const all = [...buildDatapack(DatapackFactory.create(Root as never, { name: "test", env: "dev" })).values()].join("\n");

    // Raised: instant, about the pivot *in the offset space the members live in*
    // (pivot y 2 - offset 2 = 0, so the member hanging at y -1 swings out to z +1).
    expect(all).toContain(
      "execute as @s on passengers on passengers run data merge entity @s[tag=sentinel_rig_1] {transformation:{left_rotation:[-0.707107f,0.0f,0.0f,0.707107f],right_rotation:[0.0f,0.0f,0.0f,1.0f],scale:[1.0f,1.0f,1.0f],translation:[0.0f,0.0f,1.0f]},start_interpolation:0,interpolation_duration:0}",
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
      "execute as @e[tag=sentinel] at @s unless score @s sentinel.gest matches 1.. if entity @a[distance=..3] run function test:sentinel/swing",
    );
    expect(all).toContain(
      "scoreboard players remove @e[scores={sentinel.gest=1..},tag=sentinel] sentinel.gest 1",
    );
  });
});
