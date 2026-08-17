import "reflect-metadata";
import { describe, it, expect } from "vitest";
// From the "helix" barrel, not a deep dist path - see the note in boss.test.ts.
import { Block, buildDatapack, Display, Husk } from "helix";
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
});
