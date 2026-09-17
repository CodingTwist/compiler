import { describe, it, expect } from "vitest";
import {
  Datapack,
  Particle,
  Pos,
  Selector,
  SoundEvent,
  SoundSource,
} from "../../index";
import { v26_2 } from "../../versions/profiles";
import { buildDatapack } from "../codegen/codegen";

/** The rendered body of one function built with `body`. */
function build(
  body: Parameters<ReturnType<Datapack["createFunction"]>["build"]>[0],
): string {
  const dp = new Datapack("t", v26_2);
  dp.public("f").build(body);
  return buildDatapack(dp).get("data/t/function/f.mcfunction")!.trim();
}

describe("options overloads", () => {
  it("fills particle defaults and always writes the count", () => {
    expect(build((ctx) => ctx.particle(Particle.CRIT, {}))).toBe(
      "particle minecraft:crit ~ ~ ~ 0 0 0 0 1",
    );
    expect(
      build((ctx) =>
        ctx.particle(Particle.CRIT, {
          at: Pos.rel(0, 1, 0),
          spread: [0.3, 0.4, 0.3],
          speed: 0.2,
          count: 12,
          viewers: Selector.self(),
        }),
      ),
    ).toBe("particle minecraft:crit ~ ~1 ~ 0.3 0.4 0.3 0.2 12 normal @s");
  });

  it("writes playsound arguments up to the last one given", () => {
    expect(
      build((ctx) =>
        ctx.playsound(SoundEvent.ITEM_MACE_SMASH_AIR, {
          source: SoundSource.HOSTILE,
        }),
      ),
    ).toBe("playsound minecraft:item.mace.smash_air hostile @a ~ ~ ~");
    expect(
      build((ctx) =>
        ctx.playsound(SoundEvent.ITEM_MACE_SMASH_AIR, {
          source: SoundSource.HOSTILE,
          pitch: 0.6,
        }),
      ),
    ).toBe("playsound minecraft:item.mace.smash_air hostile @a ~ ~ ~ 1 0.6");
  });
});
