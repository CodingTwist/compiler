import { describe, it, expect } from "vitest";
import { Datapack, v26_2, Block, Selector } from "helix";
import { installKit } from "../../kit";
import { raycast } from ".";

installKit([raycast]);

function build(opts?: Partial<Parameters<Datapack["raycast"]>[0]>) {
  const dp = new Datapack("test", v26_2);
  const ref = dp.raycast({
    name: "web",
    maxSteps: 100,
    onHit: (ctx) => ctx.tellraw(Selector.allPlayers(), "ray hit"),
    ...opts,
  });
  dp.report(); // populate dp.files
  return { dp, ref };
}

describe("dp.raycast (kit)", () => {
  it("registers raycast/<name> and a load-tagged init that creates raycast.work", () => {
    const { dp } = build();
    expect(dp.files.has("raycast/web")).toBe(true);
    expect(dp.tags.get("load")?.has("raycast/init")).toBe(true);
    expect(dp.files.get("raycast/init")).toContain("scoreboard objectives add raycast.work dummy");
  });

  it("marches ^ through air while its own step budget remains, then tail-recurses", () => {
    const { dp } = build();
    const ray = dp.files.get("raycast/web")!;
    expect(ray).toContain("scoreboard players remove #web_steps raycast.work 1");
    expect(ray).toContain(
      "execute if block ~ ~ ~ #minecraft:air if score #web_steps raycast.work matches 1.. positioned ^ ^ ^0.5 run return run function test:raycast/web",
    );
  });

  it("runs onHit unconditionally when no hitOn filter is set", () => {
    const { dp } = build();
    const ray = dp.files.get("raycast/web")!;
    // the on-hit body renders at top level (not behind an `if block`)
    expect(ray).toContain('tellraw @a {"text":"ray hit"}');
    expect(ray).not.toContain("if block ~ ~ ~ #minecraft:logs");
  });

  it("gates onHit behind the block filter when hitOn is set", () => {
    const { dp } = build({ hitOn: Block("#minecraft:logs") });
    const ray = dp.files.get("raycast/web")!;
    expect(ray).toContain('execute if block ~ ~ ~ #minecraft:logs run tellraw @a {"text":"ray hit"}');
  });

  it("stepBlocks overrides the stride along ^", () => {
    const { dp } = build({ stepBlocks: 1 });
    const ray = dp.files.get("raycast/web")!;
    expect(ray).toContain("positioned ^ ^ ^1 run return run function test:raycast/web");
  });

  it("fire seeds the reach budget then calls the marcher", () => {
    const dp = new Datapack("test", v26_2);
    const ref = dp.raycast({ name: "web", maxSteps: 60, onHit: () => {} });
    const fn = dp.createFunction("probe");
    fn.build((ctx) => ref.fire(ctx));
    dp.report();
    const probe = dp.files.get("probe")!;
    expect(probe).toContain("scoreboard players set #web_steps raycast.work 60");
    expect(probe).toContain("function test:raycast/web");
  });
});
