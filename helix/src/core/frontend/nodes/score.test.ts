import { describe, it, expect } from "vitest";
import { Datapack } from "../../ir/datapack";
import { Objective } from "./objective";
import { Selector } from "./selector";
import { ScoreTarget } from "../../values/score_target";
import { v26_2 } from "../../../versions/profiles";

describe("Score verbs", () => {
  it("emits get, enable and init into the ambient context", () => {
    const dp = new Datapack("p", v26_2);
    const home = new Objective("home", "trigger");
    dp.public("f").build(() => {
      home.init();
      home.score(Selector.allPlayers()).enable();
      home.score(ScoreTarget("#x")).get();
    });
    dp.report();
    expect(dp.files.get("f")!.split("\n")).toEqual([
      "scoreboard objectives add home trigger",
      "scoreboard players enable @a home",
      "scoreboard players get #x home",
    ]);
  });

  it("flips a negative add or remove, since the game only parses amounts ≥ 0", () => {
    const dp = new Datapack("p", v26_2);
    const x = new Objective("s").score(ScoreTarget("#x"));
    dp.public("f").build(() => {
      x.add(-125);
      x.remove(-3);
    });
    dp.report();
    expect(dp.files.get("f")!.split("\n")).toEqual([
      "scoreboard players remove #x s 125",
      "scoreboard players add #x s 3",
    ]);
  });

  it("refuses to enable a non-trigger objective", () => {
    const dp = new Datapack("p", v26_2);
    const s = new Objective("s").score(ScoreTarget("#x"));
    expect(() => dp.public("f").build(() => void s.enable())).toThrow(
      /trigger/,
    );
  });
});
