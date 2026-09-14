import { describe, it, expect } from "vitest";
import { Datapack, v26_2, Block, Range, Selector } from "helix";
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

const LOOP = "raycast/zzz/web/return_0/while_0";

describe("dp.raycast (kit)", () => {
  it("registers raycast/<name> and a load-tagged init that creates raycast.work", () => {
    const { dp } = build();
    expect(dp.files.has("raycast/web")).toBe(true);
    expect(dp.tags.get("load")?.has("raycast/init")).toBe(true);
    expect(dp.files.get("raycast/init")).toContain("scoreboard objectives add raycast.work dummy");
  });

  it("loops ^ through air while its own step budget remains, returning the loop's result", () => {
    const { dp } = build();
    expect(dp.files.get("raycast/web")).toBe(`return run function test:${LOOP}`);
    expect(dp.files.get(LOOP)).toContain(
      `execute if block ~ ~ ~ #minecraft:air if score #web_steps raycast.work matches 1.. run return run function test:${LOOP}/pass_0`,
    );
    expect(dp.files.get(`${LOOP}/pass_0`)!.split("\n")).toEqual([
      "scoreboard players remove #web_steps raycast.work 1",
      `execute positioned ^ ^ ^0.5 run return run function test:${LOOP}`,
    ]);
  });

  it("runs onHit unconditionally when no hitOn filter is set", () => {
    const { dp } = build();
    expect(dp.files.get(LOOP)).toContain('return run tellraw @a {"text":"ray hit"}');
  });

  it("gates onHit behind the block filter when hitOn is set", () => {
    const { dp } = build({ hitOn: Block("#minecraft:logs") });
    expect(dp.files.get(LOOP)).toContain(
      'return run execute if block ~ ~ ~ #minecraft:logs run tellraw @a {"text":"ray hit"}',
    );
  });

  it("stepBlocks overrides the stride along ^", () => {
    const { dp } = build({ stepBlocks: 1 });
    expect(dp.files.get(`${LOOP}/pass_0`)).toContain(`positioned ^ ^ ^1 run return run function test:${LOOP}`);
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

describe("dp.raycast stopAt (line of sight)", () => {
  it("ends the loop at the target and returns the reach body's result", () => {
    const { dp } = build({
      stopAt: Selector.nearest().distance(new Range(undefined, 2)),
      onReach: (ctx) => ctx.return_(1),
    });
    // The target stops the loop, and is checked before the hit so its cell never counts as a block.
    expect(dp.files.get(LOOP)).toContain("unless entity @p[distance=..2] run return run");
    expect(dp.files.get(`${LOOP}/else_0`)!.split("\n")[0]).toBe(
      "execute if entity @p[distance=..2] run return run function test:raycast/zzz/web_reach",
    );
    expect(dp.files.get("raycast/zzz/web_reach")).toContain("return 1");
  });

  it("leaves the march untouched when no target is given", () => {
    const { dp } = build();
    expect(dp.files.has("raycast/zzz/web_reach")).toBe(false);
  });
});
