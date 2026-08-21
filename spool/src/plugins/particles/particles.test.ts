import { describe, it, expect } from "vitest";
import { Datapack, Dust, Particle, v26_2 } from "helix";
import { installKit } from "../../kit";
import { particles } from ".";

installKit([particles]);

const build = (fn: Parameters<ReturnType<Datapack["createFunction"]>["build"]>[0]) => {
  const dp = new Datapack("test", v26_2);
  dp.createFunction("fx").build(fn);
  dp.report();
  return dp.files.get("fx")!;
};

describe("ctx.particleRing (kit)", () => {
  it("unrolls a ring into one command per particle, around the run position", () => {
    const out = build((ctx) => ctx.particleRing(Particle.FLAME, { radius: 2, count: 4, y: 1 }));
    expect(out.trim().split("\n")).toEqual([
      "particle minecraft:flame ~2 ~1 ~ 0 0 0 0 1",
      "particle minecraft:flame ~ ~1 ~2 0 0 0 0 1",
      "particle minecraft:flame ~-2 ~1 ~ 0 0 0 0 1",
      "particle minecraft:flame ~ ~1 ~-2 0 0 0 0 1",
    ]);
  });

  it("spirals with turns + rise, and carries a dust particle's options", () => {
    const out = build((ctx) =>
      ctx.particleRing(Dust(0xff0000), { radius: 1, count: 2, turns: 2, rise: 1 }),
    );
    expect(out.trim().split("\n")).toEqual([
      "particle minecraft:dust{color:[1.0f,0.0f,0.0f],scale:1.0f} ~1 ~ ~ 0 0 0 0 1",
      "particle minecraft:dust{color:[1.0f,0.0f,0.0f],scale:1.0f} ~1 ~0.5 ~ 0 0 0 0 1",
    ]);
  });

  it("forces the draw for a chosen audience", () => {
    const out = build((ctx) =>
      ctx.particleRing(Particle.CRIT, { radius: 1, count: 1, force: true }),
    );
    expect(out.trim()).toBe("particle minecraft:crit ~1 ~ ~ 0 0 0 0 1 force");
  });
});
