import { describe, expect, it } from "vitest";
import { v1_20_1, v1_21_4, v26_3_rc_2 } from "../../versions/profiles";
import { Chest, Dispenser, DecoratedPot, Jukebox, Sign } from "./block-entities.generated";
import { Item } from "./item";

describe("block-entities.generated", () => {
  it("chest Items renders Slot as a sibling of the stack, modern components", () => {
    const chest = Chest({ items: [{ slot: 0, item: Item.DIAMOND.count(3) }] });
    expect(chest.render(v1_21_4)).toBe(
      '{Items:[{Slot:0b,id:"minecraft:diamond",count:3}]}',
    );
  });

  it("chest Items renders legacy Count/tag pre-1.20.5", () => {
    const chest = Chest({ items: [{ slot: 2, item: Item.DIAMOND.count(3) }] });
    expect(chest.render(v1_20_1)).toBe('{Items:[{Slot:2b,id:"minecraft:diamond",Count:3b}]}');
  });

  it("dispenser reuses the same Container9 schema", () => {
    const d = Dispenser({ items: [{ slot: 0, item: Item.ARROW.count(64) }] });
    expect(d.render(v1_21_4)).toBe('{Items:[{Slot:0b,id:"minecraft:arrow",count:64}]}');
  });

  it("jukebox RecordItem, pre/post the 1.21 tick-count rename", () => {
    const j = Jukebox({ recordItem: Item.MUSIC_DISC_11.count(1) });
    expect(j.render(v1_21_4)).toBe('{RecordItem:{id:"minecraft:music_disc_11",count:1}}');
  });

  it("sign front_text is a JSON string per line before 1.21.5", () => {
    const s = Sign({ frontText: { messages: ["hi", "there"] } });
    expect(s.render(v1_21_4)).toBe(
      '{front_text:{messages:["{\\"text\\":\\"hi\\"}","{\\"text\\":\\"there\\"}"]}}',
    );
  });

  it("sign front_text is a text compound per line from 1.21.5", () => {
    const s = Sign({ frontText: { messages: ["hi", "there"] } });
    expect(s.render(v26_3_rc_2)).toBe(
      '{front_text:{messages:[{text:"hi"},{text:"there"}]}}',
    );
  });

  it("decorated pot sherds only render on 26.3+", () => {
    const pot = DecoratedPot({ sherds: { front: "minecraft:angler_pottery_sherd" } });
    expect(pot.render(v1_21_4)).toBe("{}");
  });
});
