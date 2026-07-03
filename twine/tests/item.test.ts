import "reflect-metadata";
import { describe, it, expect } from "vitest";
// Import everything from the "helix" barrel - the same specifier twine's src uses -
// so test-built Items share one class identity with the give handler (vitest loads
// a deep `helix/dist/...` path as a separate copy, breaking `instanceof ItemValue`).
import { buildDatapack, Selector, Item } from "helix";
import { Module } from "../src/module.decorator";
import { DatapackFactory } from "../src/factory";
import { defineItem } from "../src/item";

function compile(root: new () => object): {
  files: Map<string, string>;
  all: string;
  tick: string;
  file: (suffix: string) => string | undefined;
} {
  const dp = DatapackFactory.create(root as never, { name: "test", env: "dev" });
  const files = buildDatapack(dp);
  const tick = [...files].find(([p]) => p.endsWith("/tick.mcfunction"))?.[1] ?? "";
  const file = (suffix: string) => [...files].find(([p]) => p.endsWith(suffix))?.[1];
  return { files, all: [...files.values()].join("\n"), tick, file };
}

const wand = () => Item("stick").named("Frost Wand").modelData(7);

describe("defineItem", () => {
  it("emits nothing extra when no behaviours are attached", () => {
    @Module({ name: "root", imports: [defineItem(wand()).toModule("frost_wand")] })
    class Root {}

    const { files, all } = compile(Root);
    expect([...files.keys()].some((p) => p.includes("zzz/item/stick"))).toBe(false);
    expect(all).not.toContain("advancement");
  });

  it("give() emits a give function granting the fully-built item", () => {
    @Module({ name: "root", imports: [defineItem(wand()).give().toModule("frost_wand")] })
    class Root {}

    const { file } = compile(Root);
    const give = file("zzz/item/stick/give.mcfunction");
    expect(give).toBeDefined();
    expect(give).toContain("give @s minecraft:stick");
    expect(give).toContain("Frost Wand");
  });

  it("onAttack() registers a player_hurt_entity advancement + self-revoking reward", () => {
    @Module({
      name: "root",
      imports: [
        defineItem(wand())
          .onAttack((ctx) => ctx.tellraw(Selector.self(), "zap"))
          .toModule("frost_wand"),
      ],
    })
    class Root {}

    const { files, file } = compile(Root);

    const adv = file("zzz/item/stick/on_attack.json");
    expect(adv).toBeDefined();
    const json = JSON.parse(adv!);
    expect(json.criteria.trigger.trigger).toBe("minecraft:player_hurt_entity");
    expect(json.rewards.function).toBe("test:zzz/item/stick/on_attack");

    const reward = file("zzz/item/stick/on_attack.mcfunction");
    expect(reward).toBeDefined();
    expect(reward).toContain("zap");
    expect(reward).toContain("advancement revoke @s only test:zzz/item/stick/on_attack");
  });

  it("onUse() registers a using_item advancement", () => {
    @Module({
      name: "root",
      imports: [
        defineItem(wand()).onUse((ctx) => ctx.tellraw(Selector.self(), "use")).toModule("frost_wand"),
      ],
    })
    class Root {}

    const { file } = compile(Root);
    const adv = file("zzz/item/stick/on_use.json");
    expect(adv).toBeDefined();
    expect(JSON.parse(adv!).criteria.trigger.trigger).toBe("minecraft:using_item");
  });

  it("onRightClick() detects right-clicks via the used:<item> statistic", () => {
    @Module({
      name: "root",
      imports: [
        defineItem(Item("carrot_on_a_stick").named("Web Shooter"))
          .onRightClick((ctx) => {
            ctx.tellraw(Selector.self(), "click");
            ctx.tellraw(Selector.self(), "again"); // 2 cmds -> child fn, not inlined
          })
          .toModule("web_shooter"),
      ],
    })
    class Root {}

    const { file } = compile(Root);

    // A per-item statistic objective with the dotted-id criterion.
    const load = file("zzz/item/carrot_on_a_stick/rc_load.mcfunction");
    expect(load).toBe(
      "scoreboard objectives add rc_carrot_on_a_stick minecraft.used:minecraft.carrot_on_a_stick",
    );

    // The tick scan: as every holder whose count went >=1, gated by the holding
    // predicate, then a blanket reset so a use can't linger.
    const rcTick = file("zzz/item/carrot_on_a_stick/rc_tick.mcfunction");
    expect(rcTick).toContain(
      "execute as @a[scores={rc_carrot_on_a_stick=1..},predicate=test:zzz/holding/carrot_on_a_stick] at @s run function",
    );
    expect(rcTick).toContain("scoreboard players set @a rc_carrot_on_a_stick 0");

    // The body runs in the scan's child function.
    const exec = file("zzz/item/carrot_on_a_stick/rc_tick/exec_0.mcfunction");
    expect(exec).toContain("click");
  });

  it("onHeldTick() sweeps holders each tick via the holding predicate", () => {
    @Module({
      name: "root",
      imports: [
        defineItem(wand())
          .onHeldTick((ctx) => ctx.tellraw(Selector.self(), "held"))
          .toModule("frost_wand"),
      ],
    })
    class Root {}

    const { tick, files } = compile(Root);
    expect(tick).toContain("execute as @a[predicate=test:zzz/holding/stick]");
    expect([...files.keys()].some((p) => p.includes("zzz/holding/stick.json"))).toBe(true);
  });
});
