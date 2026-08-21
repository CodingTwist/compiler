import { describe, it, expect } from "vitest";
import { v1_20_4, v1_21_4 } from "../../versions/profiles";
import { Dust, DustTransition } from "./particle";

describe("particle options", () => {
  it("renders dust as SNBT on 1.20.5+ and as positional args before it", () => {
    const dust = Dust(0xff0000, 1.5);
    expect(dust.render(v1_21_4)).toBe("minecraft:dust{color:[1.0f,0.0f,0.0f],scale:1.5f}");
    expect(dust.render(v1_20_4)).toBe("minecraft:dust 1.0 0.0 0.0 1.5");
  });

  it("keeps the legacy from-scale-to argument order for the transition", () => {
    const fade = DustTransition(0x000000, 0xffffff);
    expect(fade.render(v1_21_4)).toBe(
      "minecraft:dust_color_transition{from_color:[0.0f,0.0f,0.0f],to_color:[1.0f,1.0f,1.0f],scale:1.0f}",
    );
    expect(fade.render(v1_20_4)).toBe(
      "minecraft:dust_color_transition 0.0 0.0 0.0 1.0 1.0 1.0 1.0",
    );
  });
});
