import { describe, it, expect } from "vitest";
import { v1_21_4 } from "../../versions/profiles";
import { Firework, FireworkShape } from "./firework";
import { Item } from "./item";

describe("Firework", () => {
  it("renders the fireworks component", () => {
    const fw = Firework({
      flight: 1,
      explosions: [
        { shape: FireworkShape.SMALL_BALL, colors: [0xff0000], fadeColors: [0x00ff00], trail: true },
      ],
    });
    expect(fw.render(v1_21_4)).toBe(
      '{explosions:[{shape:"small_ball",colors:[I;16711680],fade_colors:[I;65280],has_trail:true}],flight_duration:1b}',
    );
  });

  it("loads a crossbow with one, so it renders charged", () => {
    const bow = Item.CROSSBOW.chargedProjectiles(
      Item.FIREWORK_ROCKET.count(1).firework(
        Firework({ explosions: [{ shape: FireworkShape.SMALL_BALL, colors: [0xff0000] }] }),
      ),
    );
    expect(bow.render(v1_21_4)).toBe(
      'minecraft:crossbow[charged_projectiles=[{id:"minecraft:firework_rocket",count:1,' +
        'components:{"minecraft:fireworks":{explosions:[{shape:"small_ball",colors:[I;16711680]}]}}}]]',
    );
  });

  it("attaches to an item stack", () => {
    const stack = Item.FIREWORK_ROCKET.firework(
      Firework({ explosions: [{ shape: FireworkShape.BURST, colors: [0xffffff] }] }),
    );
    expect(stack.render(v1_21_4)).toBe(
      'minecraft:firework_rocket[fireworks={explosions:[{shape:"burst",colors:[I;16777215]}]}]',
    );
  });
});
