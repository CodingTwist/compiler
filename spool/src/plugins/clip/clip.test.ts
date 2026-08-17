import { describe, it, expect } from "vitest";
import { Datapack, buildDatapack, Display, Block, Selector, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { clip } from ".";

installKit([clip]); // installs dp.clip() / dp.cutscene()

// A named 2-member model: root at offset [1,0,0], one child at the origin.
function cog() {
  return Display(Block("minecraft:stone"), { translation: [1, 0, 0] })
    .add(Block("minecraft:oak_planks"), { translation: [0, 0, 0] })
    .named("cog")
    .at("~ ~ ~");
}

// A 2-member door slab (root at origin, one block above).
function door() {
  return Display(Block("minecraft:iron_block"), { translation: [0, 0, 0] })
    .add(Block("minecraft:iron_block"), { translation: [0, 1, 0] })
    .named("door")
    .at("~ ~ ~");
}

const fn = (files: Map<string, string>, name: string) =>
  files.get(`data/anim/function/${name}.mcfunction`) ?? "";

describe("Clip: baked spin", () => {
  const dp = new Datapack("anim", v1_21_4);
  dp.clip(cog()).spin("z", 90); // N = 4, step 90°
  const files = buildDatapack(dp);

  it("emits N = 4 frame functions (one revolution), no more", () => {
    [0, 1, 2, 3].forEach((k) =>
      expect(files.has(`data/anim/function/zzz/cog/frame_${k}.mcfunction`)).toBe(true),
    );
    expect(files.has("data/anim/function/zzz/cog/frame_4.mcfunction")).toBe(false);
  });

  it("frame_1 rotates +90° about Z: member offset [1,0,0] -> [0,1,0]", () => {
    expect(fn(files, "zzz/cog/frame_1")).toContain(
      "data merge entity @e[tag=cog_0,limit=1] {transformation:{left_rotation:[0.0f,0.0f,0.707107f,0.707107f],right_rotation:[0.0f,0.0f,0.0f,1.0f],scale:[1.0f,1.0f,1.0f],translation:[0.0f,1.0f,0.0f]},start_interpolation:0,interpolation_duration:1}",
    );
  });

  it("writes no driver functions until a driver is wired", () => {
    expect(files.has("data/anim/function/zzz/cog/play.mcfunction")).toBe(false);
    expect(files.has("data/anim/function/zzz/cog/tick.mcfunction")).toBe(false);
  });
});

describe("Clip: play / reverse fan-out", () => {
  const dp = new Datapack("anim", v1_21_4);
  const c = dp.clip(cog()).spin("z", 90);
  dp.load((ctx) => c.play(ctx));
  dp.createFunction("close").build((ctx) => c.reverse(ctx));
  const files = buildDatapack(dp);

  it("play runs frame_0 now and schedules the rest one per tick (append)", () => {
    const play = fn(files, "zzz/cog/play");
    expect(play).toContain("function anim:zzz/cog/frame_0");
    expect(play).toContain("schedule function anim:zzz/cog/frame_1 1 append");
    expect(play).toContain("schedule function anim:zzz/cog/frame_3 3 append");
  });

  it("reverse winds back from the rest frame to frame_0", () => {
    const rev = fn(files, "zzz/cog/reverse");
    expect(rev).toContain("function anim:zzz/cog/frame_3"); // rest = (4-1) % 4
    expect(rev).toContain("schedule function anim:zzz/cog/frame_0 3 append"); // lands on 0
  });

  it("load calls play", () => {
    expect(fn(files, "load")).toContain("function anim:zzz/cog/play");
  });
});

describe("Clip: smooth move (native tween)", () => {
  const dp = new Datapack("anim", v1_21_4);
  const s = dp.clip(door()).move([0, -16, 0]).over(100);
  dp.createFunction("open").build((ctx) => s.play(ctx));
  const files = buildDatapack(dp);

  it("emits one merge per member with the full-duration interpolation, no frames", () => {
    const play = fn(files, "zzz/door/play");
    // root [0,0,0] + [0,-16,0] = [0,-16,0]; child [0,1,0] + delta = [0,-15,0]
    expect(play).toContain(
      "data merge entity @e[tag=door_0,limit=1] {transformation:{left_rotation:[0.0f,0.0f,0.0f,1.0f],right_rotation:[0.0f,0.0f,0.0f,1.0f],scale:[1.0f,1.0f,1.0f],translation:[0.0f,-16.0f,0.0f]},start_interpolation:0,interpolation_duration:100}",
    );
    expect(play).toContain("translation:[0.0f,-15.0f,0.0f]");
    expect(files.has("data/anim/function/zzz/door/frame_0.mcfunction")).toBe(false);
  });

  it("rejects mixing a tween with a spin in one clip", () => {
    const bad = new Datapack("anim", v1_21_4);
    const c = bad.clip(cog());
    c.move([0, -1, 0]); // smooth
    c.track(cog().named("cog2")).spin("z", 90); // frame
    bad.load((ctx) => c.play(ctx));
    expect(() => buildDatapack(bad)).toThrow(/mixes a native-tween track/);
  });
});

describe("Clip: continuous loop driver", () => {
  const dp = new Datapack("anim", v1_21_4);
  const l = dp.clip(cog()).spin("z", 90).forSeconds(1);
  dp.load((ctx) => l.loop(ctx));
  const files = buildDatapack(dp);

  it("step cycles frames, advances + wraps the counter, ticks the countdown", () => {
    const step = fn(files, "zzz/cog/step");
    expect(step).toContain("execute if score cog anim matches 1 run function anim:zzz/cog/frame_1");
    expect(step).toContain("scoreboard players add cog anim 1");
    expect(step).toContain("execute if score cog anim matches 4 run scoreboard players set cog anim 0");
    expect(step).toContain("scoreboard players remove cog anim_life 1");
  });

  it("tick runs a step only while the countdown is active, tagged minecraft:tick", () => {
    expect(fn(files, "zzz/cog/tick")).toContain(
      "execute if score cog anim_life matches 1.. run function anim:zzz/cog/step",
    );
    const tag = files.get("data/minecraft/tags/function/tick.json")!;
    expect(JSON.parse(tag).values).toContain("anim:zzz/cog/tick");
  });
});

describe("Clip: generic NBT track + timeline events", () => {
  const dp = new Datapack("anim", v1_21_4);
  dp.clip(door())
    .nbt(Selector.allEntities().tag("door_0").limit(1), "transformation.scale", [
      { tick: 0, value: [1, 1, 1] },
      { tick: 10, value: [2, 2, 2] },
    ])
    .at(5, (ctx) => ctx.say("halfway"));
  const files = buildDatapack(dp);

  it("samples the path at each tick and merges it", () => {
    // at tick 5 of a 0..10 ramp, scale lerps to 1.5
    expect(fn(files, "zzz/door/frame_5")).toContain(
      "data merge entity @e[tag=door_0,limit=1] {transformation:{scale:[1.5f,1.5f,1.5f]}}",
    );
  });

  it("fires an event command on its tick", () => {
    expect(fn(files, "zzz/door/frame_5")).toContain("say halfway");
  });
});

describe("Cutscene: compose clips + camera + events on one timeline", () => {
  const dp2 = new Datapack("anim", v1_21_4);
  const mv = dp2.clip(door()).move([0, 5, 0]).over(10);
  const cs = dp2
    .cutscene("intro")
    .add(mv, { at: 0 })
    .camera(Selector.allPlayers(), [
      { tick: 0, value: [0, 100, 0] },
      { tick: 4, value: [8, 100, 0] },
    ])
    .at(3, (c) => c.say("boom"));
  dp2.createFunction("go").build((ctx) => cs.play(ctx));
  const files = buildDatapack(dp2);

  it("master play kicks the smooth sub-clip and fans the camera frames", () => {
    const play = fn(files, "zzz/intro/play");
    expect(play).toContain("function anim:zzz/door/play"); // smooth clip kicked at 0
    expect(play).toContain("function anim:zzz/intro/cam_0/frame_0");
    expect(play).toContain("schedule function anim:zzz/intro/cam_0/frame_1 1 append");
    expect(play).toContain("schedule function anim:zzz/intro/event_3 3");
  });

  it("camera interpolates the dolly via execute-as teleport", () => {
    // tick 2 of a 0..4 path [0,100,0]->[8,100,0] => x = 4
    expect(fn(files, "zzz/intro/cam_0/frame_2")).toContain("execute as @a run teleport 4 100 0");
  });
});

describe("Clip: gliding tp track", () => {
  const dp = new Datapack("anim", v1_21_4);
  const rig = Selector.allEntities().tag("rig").limit(1);
  const rig_model = Display(Block("minecraft:stone")).named("swoop").at("~ ~ ~");
  dp.clip(rig_model).tp(
    rig,
    [
      { tick: 0, value: [0, 64, 0] },
      { tick: 6, value: [0, 70, 0] },
      { tick: 10, value: [8, 70, 0] },
    ],
    true,
  );
  const files = buildDatapack(dp);

  it("teleports only on keyframes, with the gap ahead as teleport_duration", () => {
    expect(fn(files, "zzz/swoop/frame_0")).toContain(
      "data merge entity @e[tag=rig,limit=1] {teleport_duration:6}",
    );
    expect(fn(files, "zzz/swoop/frame_0")).toContain("execute as @e[tag=rig,limit=1] run teleport 0 64 0");
    expect(fn(files, "zzz/swoop/frame_6")).toContain("{teleport_duration:4}");
    // The last keyframe has nothing ahead of it, so it lands immediately.
    expect(fn(files, "zzz/swoop/frame_10")).toContain("{teleport_duration:0}");
  });

  it("emits nothing on the ticks between keyframes", () => {
    [1, 2, 3, 4, 5, 7, 8, 9].forEach((f) =>
      expect(fn(files, `zzz/swoop/frame_${f}`).trim()).toBe(""),
    );
  });

  it("rejects a stepped ease, which a linear client tween cannot honour", () => {
    expect(() =>
      dp
        .clip(Display(Block("minecraft:stone")).named("bad").at("~ ~ ~"))
        .tp(rig, [{ tick: 0, value: [0, 0, 0], ease: "step" }], true),
    ).toThrow(/step/);
  });
});
