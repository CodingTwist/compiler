import { describe, it, expect } from "vitest";
import { Datapack, v26_2 } from "helix";
import { installKit } from "../../kit";
import { playerMotion } from ".";

installKit([playerMotion]);

type EnchEffect = {
  effect: { type: string; direction?: number[]; magnitude?: number };
  requirements?: { value?: { target?: { name?: string }; score?: string } };
};

function build() {
  const dp = new Datapack("test", v26_2);
  const pm = dp.playerMotion();
  dp.report(); // populate dp.files
  return { dp, pm };
}

describe("dp.playerMotion (kit)", () => {
  it("emits the apply_impulse enchantment with a leading reset + 96 impulse effects", () => {
    const { dp } = build();
    const ench = dp.registryFileDefs.get("enchantment/internal/apply_impulse") as {
      effects: { "minecraft:location_changed": EnchEffect[] };
    };
    const effects = ench.effects["minecraft:location_changed"];
    expect(effects).toHaveLength(97); // 1 run_function reset + 3 axes * 32 bits

    // First effect is the reset run_function into this pack's namespace.
    expect(effects[0].effect).toEqual({
      type: "minecraft:run_function",
      function: "test:internal/launch/reset",
    });

    const impulses = effects.slice(1);
    expect(impulses).toHaveLength(96);
    expect(impulses.every((e) => e.effect.type === "minecraft:apply_impulse")).toBe(true);

    // Bit 31 is the sign bit: magnitude -2^31/10000; bit 0 is +0.0001.
    const bit31x = impulses.find((e) => e.requirements?.value?.target?.name === "#x.31")!;
    expect(bit31x.effect.magnitude).toBe(-214748.3648);
    expect(bit31x.effect.direction).toEqual([1, 0, 0]);
    const bit0z = impulses.find((e) => e.requirements?.value?.target?.name === "#z.0")!;
    expect(bit0z.effect.magnitude).toBe(0.0001);
    expect(bit0z.effect.direction).toEqual([0, 0, 1]);

    // Every effect reads the shared store objective.
    expect(impulses.every((e) => e.requirements?.value?.score === "player_motion.internal.store")).toBe(true);
  });

  it("decomposes each axis into 32 bit lines in internal/store/x", () => {
    const { dp } = build();
    const storeX = dp.files.get("internal/store/x")!;
    const lines = storeX.split("\n");
    // One multi-store clear line, the zero short-circuit, the sign bit, bits 30..1, and bit 0.
    expect(storeX).toContain("store result score #x.0 player_motion.internal.store");
    expect(storeX).toContain("store result score #x.30 player_motion.internal.store run scoreboard players set #x.31 player_motion.internal.store 0");
    expect(storeX).toContain("execute store success score #x.31 player_motion.internal.store if score #x player_motion.internal.dummy matches ..-1 run scoreboard players add #x player_motion.internal.dummy 2147483647");
    expect(storeX).toContain("execute store success score #x.30 player_motion.internal.store if score #x player_motion.internal.dummy matches 1073741824.. run scoreboard players remove #x player_motion.internal.dummy 1073741824");
    expect(storeX).toContain("execute if score #x player_motion.internal.dummy matches 1.. run scoreboard players set #x.0 player_motion.internal.store 1");
    // 1 clear + 1 zero-check + 1 sign + 30 middle bits + 1 low bit = 34 commands.
    expect(lines).toHaveLength(34);
  });

  it("registers both predicates and the load-tagged init", () => {
    const { dp } = build();
    expect(dp.registryFileDefs.has(`${v26_2.paths.predicate}/internal/large_global`)).toBe(true);
    expect(dp.registryFileDefs.has(`${v26_2.paths.predicate}/internal/falling_creative_player`)).toBe(true);
    expect(dp.tags.get("load")?.has("internal/init")).toBe(true);
    expect(dp.files.get("internal/init")).toContain("summon minecraft:marker 0.0 0.0 0.0");
  });

  it("launch_global_xyz takes the macro-free path and fails cleanly on large vectors", () => {
    const { dp } = build();
    const g = dp.files.get("api/launch_global_xyz")!;
    expect(g).toContain("execute if predicate test:internal/large_global run return fail");
    expect(g).toContain("function test:internal/math/global/convert_to_local");
    expect(g.trimEnd().endsWith("return run function test:internal/launch/main")).toBe(true);
  });

  it("launchLocal converts block/tick velocity to fixed-point and calls the local fn", () => {
    const { dp, pm } = build();
    dp.createFunction("demo/leap").build((ctx) => {
      pm.launchLocal(ctx, { up: 0.8, forward: 1.2 }); // sideways defaults to 0
    });
    dp.report(); // re-populate dp.files now the demo function exists
    const lines = dp.files.get("demo/leap")!.trimEnd().split("\n");
    expect(lines).toEqual([
      "scoreboard players set $x player_motion.api.launch 0",
      "scoreboard players set $y player_motion.api.launch 8000",
      "scoreboard players set $z player_motion.api.launch 12000",
      "function test:api/launch_local_xyz",
    ]);
  });

  it("launchGlobal maps x/y/z world axes and calls the global fn", () => {
    const { dp, pm } = build();
    dp.createFunction("demo/shove").build((ctx) => {
      pm.launchGlobal(ctx, { x: -1.5, z: 2 });
    });
    dp.report(); // re-populate dp.files now the demo function exists
    const leap = dp.files.get("demo/shove")!;
    expect(leap).toContain("scoreboard players set $x player_motion.api.launch -15000");
    expect(leap).toContain("scoreboard players set $y player_motion.api.launch 0");
    expect(leap).toContain("scoreboard players set $z player_motion.api.launch 20000");
    expect(leap.trimEnd().endsWith("function test:api/launch_global_xyz")).toBe(true);
  });

  it("launch/main gates the gamemode-swap trigger behind a read-and-clear #sustain flag", () => {
    const { dp } = build();
    const main = dp.files.get("internal/launch/main")!;
    // Sustained callers skip the swap: clear the flag and return in one inlined command.
    expect(main).toContain(
      "execute if score #sustain player_motion.internal.dummy matches 1 run return run scoreboard players set #sustain player_motion.internal.dummy 0",
    );
    // The gamemode-swap trigger still follows for normal (non-sustained) launches.
    expect(main).toContain("gamemode spectator");
  });

  it("applyGlobal(ctx) with no velocity sustains the current launchInput", () => {
    const { dp, pm } = build();
    dp.createFunction("demo/sustain").build((ctx) => {
      pm.applyGlobal(ctx); // no velocity: drive whatever is already in launchInput
    });
    dp.report();
    const lines = dp.files.get("demo/sustain")!.trimEnd().split("\n");
    expect(lines).toEqual([
      "scoreboard players set #sustain player_motion.internal.dummy 1",
      "function test:api/launch_global_xyz",
    ]);
  });

  it("applyLocal sets the sustain flag, then the inputs, then calls the local fn", () => {
    const { dp, pm } = build();
    dp.createFunction("demo/thrust").build((ctx) => {
      pm.applyLocal(ctx, { forward: 1.0 });
    });
    dp.report();
    const lines = dp.files.get("demo/thrust")!.trimEnd().split("\n");
    expect(lines).toEqual([
      "scoreboard players set #sustain player_motion.internal.dummy 1",
      "scoreboard players set $x player_motion.api.launch 0",
      "scoreboard players set $y player_motion.api.launch 0",
      "scoreboard players set $z player_motion.api.launch 10000",
      "function test:api/launch_local_xyz",
    ]);
  });

  it("is idempotent - a second call returns the same handle without re-registering", () => {
    const dp = new Datapack("test", v26_2);
    const a = dp.playerMotion();
    const b = dp.playerMotion();
    expect(a).toBe(b);
  });
});
