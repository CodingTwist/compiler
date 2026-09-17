import { describe, it, expect } from "vitest";
import { Datapack } from "./datapack";
import { v1_21_4 } from "../../../versions/profiles";

describe("dp.variable", () => {
  it("names the holder and declares its objective once", () => {
    const dp = new Datapack("p", v1_21_4);
    const a = dp.variable("door.open");
    dp.public("f").build(() => {
      a.set(1);
      dp.variable("door.open").add(2);
    });
    dp.report();
    const out = [...dp.files.values()].join("\n");
    expect(out).toContain("scoreboard objectives add helix.global dummy");
    expect(out).toContain("scoreboard players set #door.open helix.global 1");
    expect(out).toContain("scoreboard players add #door.open helix.global 2");
  });
});

describe("function groups", () => {
  it("names private functions under zzzprivate/ and public ones in place", () => {
    const dp = new Datapack("p", v1_21_4);
    const door = dp.group("door");
    expect(door.createFunction("slide").getName()).toBe(
      "zzzprivate/door/slide",
    );
    expect(door.public("open").getName()).toBe("door/open");
    expect(door.group("lobby").public("open").getName()).toBe(
      "door/lobby/open",
    );
    expect(dp.createFunction("tick").getName()).toBe("tick");
  });

  it("puts private functions beside their owner in the beside layout", () => {
    const dp = new Datapack("p", v1_21_4, undefined, { layout: "beside" });
    expect(dp.group("door").createFunction("slide").getName()).toBe(
      "door/zzz/slide",
    );
    let child = "";
    dp.public("door/open").build((ctx) => {
      child = ctx.createChildFunction("if").name;
    });
    expect(child).toBe("door/zzz/open/if_0");
  });

  it("returns one view per path, writing through to the pack", () => {
    const dp = new Datapack("p", v1_21_4);
    const view = dp.group("a").group("b");
    expect(dp.group("a/b")).toBe(view);
    expect(view.root).toBe(dp);
    view.public("f");
    expect(dp.functions.has("a/b/f")).toBe(true);
    view.useTarget("paper");
    expect(dp.target).toBe("paper");
  });

  it("nests prototype methods called on a view", () => {
    const dp = new Datapack("p", v1_21_4);
    const proto = Datapack.prototype as unknown as Record<string, unknown>;
    proto.helper = function (this: Datapack) {
      return this.createFunction("helper").getName();
    };
    try {
      const view = dp.group("mob") as unknown as { helper(): string };
      expect(view.helper()).toBe("zzzprivate/mob/helper");
    } finally {
      delete proto.helper;
    }
  });
});
