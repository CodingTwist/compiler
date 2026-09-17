// Checks the commands a look ray compiles to (the simulator has no rotation yet).
import { describe, expect, it } from "vitest";
import { Datapack, v26_3_rc_2 } from "helix";
import { installKit } from "../../kit";
import { raycast } from ".";

installKit([raycast]);

describe("dp.lookRay", () => {
  it("reads the eyes through the locator and turns Rotation into a direction", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    expect(dp.lookRay()).toBe(dp.lookRay());
    dp.public("look").build((ctx) => dp.lookRay().fill(ctx));
    dp.report();
    const lines = dp.files.get("look")!;
    expect(lines).toContain("execute anchored eyes positioned ^ ^ ^ run teleport 6c6f63-0-0-0-1 ~ ~ ~");
    expect(lines).toContain("data get entity 6c6f63-0-0-0-1 Pos[1] 1000");
    expect(lines).toContain("data get entity @s Rotation[1] 1000");
    expect(lines).toContain('"type":"sin"');
    expect(lines).not.toContain("kill");
  });
});
