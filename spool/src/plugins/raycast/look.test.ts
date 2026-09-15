// Checks the commands a look ray compiles to (the simulator has no rotation yet).
import { describe, expect, it } from "vitest";
import { Datapack, v26_3_rc_2 } from "helix";
import { installKit } from "../../kit";
import { raycast } from ".";

installKit([raycast]);

describe("dp.lookRay", () => {
  it("summons a probe at the eyes, reads it there and a block ahead, then kills it", () => {
    const dp = new Datapack("test", v26_3_rc_2);
    expect(dp.lookRay()).toBe(dp.lookRay());
    dp.createFunction("look").build((ctx) => dp.lookRay().fill(ctx));
    dp.report();
    const lines = dp.files.get("look")!;
    expect(lines).toMatch(/^execute anchored eyes positioned \^ \^ \^ run summon minecraft:marker/);
    expect(lines).toContain("execute anchored eyes positioned ^ ^ ^1 run teleport 7261-0-0-0-1 ~ ~ ~");
    expect(lines).toMatch(/kill 7261-0-0-0-1/);
  });
});
