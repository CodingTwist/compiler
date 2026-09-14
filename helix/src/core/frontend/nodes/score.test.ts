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
    dp.createFunction("f").build(() => {
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

  it("refuses to enable a non-trigger objective", () => {
    const dp = new Datapack("p", v26_2);
    const s = new Objective("s").score(ScoreTarget("#x"));
    expect(() => dp.createFunction("f").build(() => void s.enable())).toThrow(/trigger/);
  });
});
