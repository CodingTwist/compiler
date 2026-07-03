import { describe, it, expect } from "vitest";
import { Datapack, Selector, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { entitySet } from "./index";

installKit([entitySet]);

describe("dp.entitySet (kit)", () => {
  it("all() is a bounded @e[tag=…] scan, not a full sweep", () => {
    const dp = new Datapack("test", v1_21_4);
    const guards = dp.entitySet("guard");
    expect(guards.all().render(v1_21_4)).toBe("@e[tag=guard]");
  });

  it("nearest() narrows to a single sorted member", () => {
    const dp = new Datapack("test", v1_21_4);
    expect(dp.entitySet("guard").nearest().render(v1_21_4)).toBe(
      "@e[tag=guard,limit=1,sort=nearest]",
    );
  });

  it("add() tags entities via the vanilla tag command", () => {
    const dp = new Datapack("test", v1_21_4);
    const ref = dp.createFunction("mark");
    ref.build((ctx) => dp.entitySet("guard").add(ctx, Selector.self()));
    // Render the function and assert the emitted tag-add line.
    dp.report();
    expect(dp.files.get("mark")).toContain("tag @s add guard");
  });
});
