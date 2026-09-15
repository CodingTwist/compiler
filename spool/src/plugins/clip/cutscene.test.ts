import { describe, it, expect } from "vitest";
import {
  Datapack,
  buildDatapack,
  Display,
  Block,
  Selector,
  v1_21_4,
} from "helix";
import { installKit } from "../../kit";
import { clip } from ".";

installKit([clip]); // installs dp.clip() / dp.cutscene()

// A 2-member door slab (root at origin, one block above).
function door() {
  return Display(Block("minecraft:iron_block"), { translation: [0, 0, 0] })
    .add(Block("minecraft:iron_block"), { translation: [0, 1, 0] })
    .named("door")
    .at("~ ~ ~");
}

const fn = (files: Map<string, string>, name: string) =>
  files.get(`data/anim/function/${name}.mcfunction`) ?? "";

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
    expect(play).toContain("execute as @a run teleport 0 100 0"); // frame 0 inlined
    expect(play).toContain(
      "schedule function anim:zzz/intro/cam_0/frame_1 1 append",
    );
    expect(play).toContain("schedule function anim:zzz/intro/event_3 3");
  });

  it("camera interpolates the dolly via execute-as teleport", () => {
    // tick 2 of a 0..4 path [0,100,0]->[8,100,0] => x = 4
    expect(fn(files, "zzz/intro/cam_0/frame_2")).toContain(
      "execute as @a run teleport 4 100 0",
    );
  });
});
