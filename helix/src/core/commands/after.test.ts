import { describe, it, expect } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { v1_21_4 } from "../../versions/profiles";
import { Time } from "../values";

describe("dp.after", () => {
  it("schedules an auto-named body instead of making the author name one", () => {
    const dp = new Datapack("mypack", v1_21_4);
    dp.tick((ctx) => {
      dp.after(ctx, Time.seconds(3), (c) => c.say("done"));
    });

    const files = buildDatapack(dp);
    expect(files.get("data/mypack/function/tick.mcfunction")).toBe(
      "schedule function mypack:zzz/tick/after_0 3s",
    );
    expect(files.get("data/mypack/function/zzz/tick/after_0.mcfunction")).toBe(
      "say done",
    );
  });

  it("appends rather than replaces when asked", () => {
    const dp = new Datapack("mypack", v1_21_4);
    dp.tick((ctx) => {
      dp.after(ctx, Time(20), (c) => c.say("later"), true);
    });
    expect(buildDatapack(dp).get("data/mypack/function/tick.mcfunction")).toBe(
      "schedule function mypack:zzz/tick/after_0 20 append",
    );
  });
});
