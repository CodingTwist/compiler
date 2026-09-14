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
