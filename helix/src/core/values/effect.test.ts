import { describe, it, expect } from "vitest";
import { Effect } from "./effect";
import { MobEffect } from "./resource.generated";
import { v1_20_1, v26_2 } from "../../versions/profiles";

describe("Effect", () => {
  const pinned = Effect({
    id: MobEffect.SLOWNESS,
    amplifier: 127,
    duration: -1,
    showParticles: false,
  });

  it("renders modern keys and a resource id", () => {
    expect(pinned.render(v26_2)).toBe(
      '{id:"minecraft:slowness",amplifier:127b,duration:-1,show_particles:0b}',
    );
  });

  it("renders pre-1.20.2 capitalised keys and the numeric id", () => {
    expect(pinned.render(v1_20_1)).toBe(
      "{Id:2,Amplifier:127b,Duration:-1,ShowParticles:0b}",
    );
  });

  it("nests a hidden effect", () => {
    expect(
      Effect({ id: MobEffect.POISON, hiddenEffect: { id: MobEffect.POISON } }).render(v26_2),
    ).toBe('{id:"minecraft:poison",hidden_effect:{id:"minecraft:poison"}}');
  });
});
