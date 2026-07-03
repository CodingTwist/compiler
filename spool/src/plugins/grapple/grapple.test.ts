import { describe, it, expect } from "vitest";
import { Datapack, v26_2, Block } from "helix";
import { installKit } from "../../kit";
import { playerMotion } from "../player_motion";
import { raycast } from "../raycast";
import { grapple } from ".";
import { ZERO_GRAVITY, RADIAL_DAMP_DIV } from "./tuning";

installKit([playerMotion, raycast, grapple]);

function build(opts?: Parameters<Datapack["grapple"]>[0]) {
  const dp = new Datapack("test", v26_2);
  const g = dp.grapple(opts);
  dp.report(); // populate dp.files
  return { dp, g };
}

/** The gated attach body lives in a generated child function; find it by content. */
function attachBody(dp: Datapack): string {
  const hit = [...dp.files.entries()].find(([, v]) => v.includes("tag @s add grappling"));
  if (!hit) throw new Error("attach child function not found");
  return hit[1];
}

describe("dp.grapple (kit)", () => {
  it("registers start/drive/constrain/tick/stop + the web ray, and tick-tags the loop", () => {
    const { dp, g } = build();
    for (const f of ["grapple/start", "grapple/drive", "grapple/constrain", "grapple/tick", "grapple/stop"]) {
      expect(dp.files.has(f)).toBe(true);
    }
    // The raycast marcher lives in the `raycast` plugin's own namespace now.
    expect(dp.files.has("raycast/grapple/web")).toBe(true);
    expect(dp.tags.get("tick")?.has("grapple/tick")).toBe(true);
    expect(g.start.getName()).toBe("grapple/start");
    expect(g.stop.getName()).toBe("grapple/stop");
  });

  it("pulls in player_motion (its api functions are present)", () => {
    const { dp } = build();
    expect(dp.files.has("api/launch_global_xyz")).toBe(true);
    expect(dp.files.has("internal/launch/main")).toBe(true);
  });

  it("the web ray (raycast plugin) marches along ^ while air remains and anchors by summoning the marker", () => {
    const { dp } = build();
    const ray = dp.files.get("raycast/grapple/web")!;
    expect(ray).toContain(
      "execute if block ~ ~ ~ #minecraft:air if score #grapple_web_steps raycast.work matches 1.. positioned ^ ^ ^0.5 run return run function test:raycast/grapple/web",
    );
    // With no block filter the on-hit body (summon + read) inlines into the marcher.
    expect(ray).toContain('summon minecraft:marker ~ ~ ~ {Tags:["grapple.anchor","grapple._new"]}');
    expect(ray).toContain("store result score @s grapple.anchor_x run data get entity @e[tag=grapple._new,limit=1] Pos[0] 10");
  });

  it("default reach is 100 steps and anchors on any block (no block gate)", () => {
    const { dp } = build();
    const all = [...dp.files.values()].join("\n");
    const ray = dp.files.get("raycast/grapple/web")!;
    // start seeds the ray's step budget (via the raycast plugin's step slot) before marching.
    expect(all).toContain("scoreboard players set #grapple_web_steps raycast.work 100");
    // unconditional summon - no `if block` prefix on the summon line.
    expect(ray).toContain("\nsummon minecraft:marker ~ ~ ~ {Tags:");
    expect(ray).not.toContain("if block ~ ~ ~ #minecraft:logs");
  });

  it("anchorOn restricts the anchor block and maxReach sets the step count", () => {
    const { dp } = build({ anchorOn: Block("#minecraft:logs"), maxReach: 30 });
    const all = [...dp.files.values()].join("\n");
    const ray = dp.files.get("raycast/grapple/web")!;
    expect(all).toContain("scoreboard players set #grapple_web_steps raycast.work 60"); // 30 blocks * 2 steps
    // the hit is gated on the block; the summon+read is the raycast plugin's gated on-hit branch.
    expect(ray).toContain("execute if block ~ ~ ~ #minecraft:logs run function test:");
    expect(all).toContain('summon minecraft:marker ~ ~ ~ {Tags:["grapple.anchor","grapple._new"]}');
  });

  it("start attaches only when an anchor was placed, fixing the rope and leashing it", () => {
    const { dp } = build();
    const start = dp.files.get("grapple/start")!;
    const all = [...dp.files.values()].join("\n");
    // start roots the web at the eyes and fires the ray (a generated child seeds + calls it).
    expect(start).toContain("execute at @s anchored eyes positioned ^ ^ ^ run function test:");
    expect(all).toContain("function test:raycast/grapple/web");
    // Attach + the miss feedback are both gated on the just-summoned anchor existing.
    expect(start).toContain("execute if entity @e[tag=grapple._new] run function");
    expect(start).toContain("execute unless entity @e[tag=grapple._new] run tellraw");

    const attach = attachBody(dp);
    // rope length² is written straight into the per-player score via lengthSquared.
    expect(attach).toContain("scoreboard players operation @s grapple.rope_len_sq = #to_anchor_x grapple.work");
    expect(attach).toContain("scoreboard players operation @s grapple.rope_len_sq *= #to_anchor_x grapple.work");
    // a fresh shared id on the player and its anchor
    expect(attach).toContain("scoreboard players add #next_id grapple.const 1");
    expect(attach).toContain("scoreboard players operation @s grapple.id = #next_id grapple.const");
    expect(attach).toContain("execute as @e[tag=grapple._new] run scoreboard players operation @s grapple.id = #next_id grapple.const");
    expect(attach).toContain("tag @s add grappling");
    // gravity handling follows the ZERO_GRAVITY toggle: zeroed via a removable modifier
    // (momentum-orbit model) when on, left untouched (engine-gravity swing) when off.
    const gravityAdd = "attribute @s minecraft:gravity modifier add grapple:zero_gravity -1 add_multiplied_total";
    if (ZERO_GRAVITY) expect(attach).toContain(gravityAdd);
    else expect(attach).not.toContain("minecraft:gravity");
    // transient summon handles are dropped
    expect(attach).toContain("tag @e[tag=grapple._new] remove grapple._new");
  });

  it("drive draws a particle rope: tags this player's anchor, faces it, marches grapple/rope", () => {
    const { dp } = build();
    const drive = dp.files.get("grapple/drive")!;
    // tag exactly this player's anchor as the aim target
    expect(drive).toContain("scoreboard players operation #rope_id grapple.work = @s grapple.id");
    expect(drive).toContain("execute as @e[tag=grapple.anchor] if score @s grapple.id = #rope_id grapple.work run tag @s add grapple._aim");
    // aim ^ at it from the eyes and hand off to the marcher, then untag
    expect(drive).toContain("facing entity @e[tag=grapple._aim,limit=1] feet run function test:grapple/rope");
    expect(drive).toContain("tag @e[tag=grapple._aim,limit=1] remove grapple._aim");

    const rope = dp.files.get("grapple/rope")!;
    expect(rope).toContain("particle minecraft:electric_spark ~ ~ ~ 0 0 0 0 1");
    // step toward the anchor until reached (within 0.6) or out of steps
    expect(rope).toContain("unless entity @e[distance=..0.6,tag=grapple._aim,limit=1]");
    expect(rope).toContain("positioned ^ ^ ^1 run return run function test:grapple/rope");
  });

  it("constrain assigns the full radial cancel, a Baumgarte trim, and a tangential sustain into the launch input", () => {
    const { dp } = build();
    const c = dp.files.get("grapple/constrain")!;
    // coef = -dot (cancel the radial velocity in either direction - rigid rope) ...
    expect(c).toContain("scoreboard players operation #coef grapple.work = #dot grapple.work");
    expect(c).toContain("scoreboard players operation #coef grapple.work *= #neg_one grapple.const");
    // ... + (dist_sq - rope_len_sq)/BAUMGARTE_DIV (Baumgarte position trim); no `max(0)` floor
    expect(c).toContain("scoreboard players operation #baum grapple.work = #dist_sq grapple.work");
    expect(c).toContain("scoreboard players operation #baum grapple.work -= @s grapple.rope_len_sq");
    expect(c).toContain("scoreboard players operation #baum grapple.work /= #baum_div grapple.const");
    // ... capped at baumMax (the anti-fling bounce killer) before folding into coef
    expect(c).toContain("scoreboard players operation #baum grapple.work < #baum_max grapple.const");
    expect(c).toContain("scoreboard players operation #coef grapple.work += #baum grapple.work");
    expect(c).not.toContain("#zero");
    // frac = coef * FRAC_SCALE / dist_sq
    expect(c).toContain("scoreboard players operation #frac grapple.work = #coef grapple.work");
    expect(c).toContain("scoreboard players operation #frac grapple.work *= #frac_scale grapple.const");
    expect(c).toContain("scoreboard players operation #frac grapple.work /= #dist_sq grapple.work");
    // impulse = frac * r, written straight into player_motion's launch input
    expect(c).toContain("scoreboard players operation $x player_motion.api.launch = #to_anchor_x grapple.work");
    expect(c).toContain("scoreboard players operation $x player_motion.api.launch *= #frac grapple.work");
    // tangential sustain: fracRad = dot * FRAC_SCALE / dist_sq, radial = fracRad * r, then
    // tang = v*FRAC_SCALE - radial, /= SUSTAIN_DIV, added back (anti-drag, radial excluded)
    expect(c).toContain("scoreboard players operation #frac_rad grapple.work = #dot grapple.work");
    expect(c).toContain("scoreboard players operation #frac_rad grapple.work /= #dist_sq grapple.work");
    expect(c).toContain("scoreboard players operation #rad_x grapple.work = #to_anchor_x grapple.work");
    expect(c).toContain("scoreboard players operation #rad_x grapple.work *= #frac_rad grapple.work");
    expect(c).toContain("scoreboard players operation #tang_x grapple.work = #vel_x grapple.work");
    expect(c).toContain("scoreboard players operation #tang_x grapple.work -= #rad_x grapple.work");
    expect(c).toContain("scoreboard players operation #tang_x grapple.work /= #sustain_div grapple.const");
    expect(c).toContain("scoreboard players operation $x player_motion.api.launch += #tang_x grapple.work");
    // radial overdamp is a disabled rebound generator (RADIAL_DAMP_DIV=0): when off it
    // emits nothing; if ever re-enabled it bleeds an extra radVec/RADIAL_DAMP_DIV.
    if (RADIAL_DAMP_DIV > 0) {
      expect(c).toContain("scoreboard players operation #rad_x grapple.work /= #radial_damp_div grapple.const");
      expect(c).toContain("scoreboard players operation $x player_motion.api.launch -= #rad_x grapple.work");
    } else {
      expect(c).not.toContain("#radial_damp_div");
    }
    // clamp + sustain-flag are the caller's job (drive), not constrain's
    expect(c).not.toContain("#impulse_max");
    expect(c).not.toContain("#sustain player_motion.internal.dummy");
    expect(c).not.toContain("launch_global_xyz");
  });

  it("drive zeroes the launch, gates the constraint on taut, then clamps and sustains (engine gravity falls)", () => {
    const { dp } = build();
    const drive = dp.files.get("grapple/drive")!;
    // slack-tick baseline: launch starts at zero each tick (a zero impulse adds nothing,
    // so a slack tick lets the player fall under engine gravity untouched)
    expect(drive).toContain("scoreboard players set $x player_motion.api.launch 0");
    expect(drive).toContain("scoreboard players set $y player_motion.api.launch 0");
    expect(drive).toContain("scoreboard players set $z player_motion.api.launch 0");
    // constraint runs only when taut (dist² ≥ rope²)
    expect(drive).toContain("execute if score #dist_sq grapple.work >= @s grapple.rope_len_sq run function test:grapple/constrain");
    // no simulated gravity is injected - the engine's own gravity does the falling
    expect(drive).not.toContain("#grav_impulse");
    // then clamp per axis and sustain the impulse
    expect(drive).toContain("scoreboard players operation $x player_motion.api.launch < #impulse_max grapple.const");
    expect(drive).toContain("scoreboard players operation $x player_motion.api.launch > #impulse_min grapple.const");
    expect(drive).toContain("scoreboard players set #sustain player_motion.internal.dummy 1");
    expect(drive).toContain("function test:api/launch_global_xyz");
  });

  it("drive drives every grappling player; stop releases the tag and the player's anchor", () => {
    const { dp } = build();
    expect(dp.files.get("grapple/tick")).toContain("execute as @a[tag=grappling] at @s run function test:grapple/drive");
    const stop = dp.files.get("grapple/stop")!;
    expect(stop).toContain("tag @s remove grappling");
    // gravity zeroed on attach is restored by removing the modifier (only when the toggle is on)
    if (ZERO_GRAVITY) {
      expect(stop).toContain("attribute @s minecraft:gravity modifier remove grapple:zero_gravity");
    } else {
      expect(stop).not.toContain("minecraft:gravity");
    }
    // kill exactly this player's anchor entities (matched by shared id)
    expect(stop).toContain("scoreboard players operation #stop_id grapple.work = @s grapple.id");
    expect(stop).toContain("execute as @e[tag=grapple.anchor] if score @s grapple.id = #stop_id grapple.work run kill @s");
  });

  it("stop flings the player along their look direction, scaled by swing speed², at @s", () => {
    const { dp } = build();
    // the kick runs `at @s` (the local-frame launch needs the player's position/rotation context)
    expect(dp.files.get("grapple/stop")).toContain("execute at @s run function");
    const all = [...dp.files.values()].join("\n");
    // drive stashes the per-tick swing velocity into per-player state (so the kick can't race prev)
    expect(dp.files.get("grapple/drive")).toContain("scoreboard players operation @s grapple.vel_x = #vel_x grapple.work");
    // kick reads that stored velocity and takes speed² = v·v (lengthSquared), NOT a fresh pos−prev
    expect(all).toContain("scoreboard players operation #frac grapple.work = @s grapple.vel_x");
    expect(all).toContain("scoreboard players operation #frac grapple.work *= @s grapple.vel_x");
    // forward launch (local +z / line of sight) = speed² * release_kick, capped, sideways/up zeroed
    expect(all).toContain("scoreboard players set $x player_motion.api.launch 0");
    expect(all).toContain("scoreboard players set $y player_motion.api.launch 0");
    expect(all).toContain("scoreboard players operation $z player_motion.api.launch = #frac grapple.work");
    expect(all).toContain("scoreboard players operation $z player_motion.api.launch *= #release_kick grapple.const");
    expect(all).toContain("scoreboard players operation $z player_motion.api.launch < #release_kick_max grapple.const");
    // launched in the LOCAL frame (look direction), not global
    expect(all).toContain("function test:api/launch_local_xyz");
  });

  it("init seeds the id counter only when unset", () => {
    const { dp } = build();
    const init = dp.files.get("grapple/init")!;
    expect(init).toContain("scoreboard objectives add grapple.id dummy");
    expect(init).toContain("execute unless score #next_id grapple.const = #next_id grapple.const run scoreboard players set #next_id grapple.const 0");
    expect(init).toContain("scoreboard players set #release_kick grapple.const 90");
    expect(init).toContain("scoreboard players set #release_kick_max grapple.const 16000");
  });

  it("is idempotent", () => {
    const dp = new Datapack("test", v26_2);
    expect(dp.grapple()).toBe(dp.grapple());
  });
});
