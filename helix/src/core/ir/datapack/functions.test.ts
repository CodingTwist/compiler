import { describe, it, expect } from "vitest";
import { Datapack } from "./datapack";
import { v1_21_4 } from "../../../versions/profiles";

describe("dp.variable", () => {
  it("names the holder and declares its objective once", () => {
    const dp = new Datapack("p", v1_21_4);
    const a = dp.variable("door.open");
    dp.createFunction("f").build(() => {
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

describe("nameless functions", () => {
  it("nests under the function being built, else goes in root zzz/", () => {
    const dp = new Datapack("p", v1_21_4);
    const top = dp.createFunction();
    let inner = "";
    let second = "";
    dp.createFunction("mace/tick").build(() => {
      inner = dp.createFunction().getName();
      second = dp.createFunction().getName();
    });
    expect(top.getName()).toBe("zzz/fn_0");
    expect(inner).toBe("mace/zzz/tick/fn_0");
    expect(second).toBe("mace/zzz/tick/fn_1");
  });

  it("doesn't reuse a name when the same parent is built twice", () => {
    const dp = new Datapack("p", v1_21_4);
    const parent = dp.getOrCreateFunction("a");
    const names: string[] = [];
    parent.build(() => void names.push(dp.createFunction().getName()));
    parent.build(() => void names.push(dp.createFunction().getName()));
    expect(names).toEqual(["zzz/a/fn_0", "zzz/a/fn_1"]);
  });

  it("dp.group places register-time nameless functions under the group", () => {
    const dp = new Datapack("p", v1_21_4);
    const names = dp.group("stage1", () => [
      dp.createFunction().getName(),
      dp.group("ladder", () => dp.createFunction().getName()),
    ]);
    expect(names).toEqual(["stage1/zzz/fn_0", "stage1/zzz/ladder/fn_0"]);
    expect(dp.createFunction().getName()).toBe("zzz/fn_0");
  });

  it("dp.fn takes just a body", () => {
    const dp = new Datapack("p", v1_21_4);
    const f = dp.fn((ctx) => ctx.say("hi"));
    expect(f.getName()).toBe("zzz/fn_0");
  });
});
