import { it } from "vitest";
import { Datapack, buildDatapack, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { ballistics } from "./index";
import { writeFileSync } from "node:fs";
installKit([ballistics]);
it("d", () => {
  const dp = new Datapack("art", v1_21_4);
  dp.ballisticRuntime("a", { lead: true, ticks: 30 });
  writeFileSync("/tmp/claude-1000/-home-sam-compiler/9fc33a59-4d9e-43c3-a0d1-f88446a9dabf/scratchpad/dump.txt",
    [...buildDatapack(dp)].map(([p, b]) => `=== ${p}\n${b}`).join("\n"));
});
