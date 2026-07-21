import { describe, expect, it } from "vitest";
import { Datapack } from "../ir/datapack";
import { buildDatapack } from "../codegen/codegen";
import { Selector } from "../frontend/nodes/selector";
import { selectorText } from "../frontend/nodes/selector_text";
import { text } from "../frontend/nodes/text";
import { Color } from "../values/enums";
import { v26_1_2 } from "../../versions/26_1_2";

describe("selectorText", () => {
  const render = (build: (dp: Datapack) => void): string => {
    const dp = new Datapack("t", v26_1_2);
    build(dp);
    const files = buildDatapack(dp);
    return [...files.entries()].find(([p]) => p.endsWith("f.mcfunction"))![1];
  };

  it("renders a `selector` component carrying the built selector", () => {
    const out = render((dp) => {
      dp.createFunction("f").build((ctx) => {
        ctx.tellraw(Selector.allPlayers(), selectorText(Selector.self()));
      });
    });
    expect(out.trim()).toBe('tellraw @a {"selector":"@s"}');
  });

  it("renders selector filters through the typed selector path", () => {
    const out = render((dp) => {
      dp.createFunction("f").build((ctx) => {
        ctx.tellraw(
          Selector.self(),
          selectorText(Selector.allPlayers().tag("Verbose").limit(1)),
        );
      });
    });
    expect(out.trim()).toBe('tellraw @s {"selector":"@a[tag=Verbose,limit=1]"}');
  });

  it("carries style alongside the selector, like any other part", () => {
    const out = render((dp) => {
      dp.createFunction("f").build((ctx) => {
        ctx.tellraw(Selector.allPlayers(), [
          text("as: ").color(Color.GRAY),
          selectorText(Selector.self()).italic(),
        ]);
      });
    });
    expect(out.trim()).toBe(
      'tellraw @a [{"text":"as: ","color":"gray"},{"selector":"@s","italic":true}]',
    );
  });
});
