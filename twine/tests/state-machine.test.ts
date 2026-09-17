import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Datapack, Selector, v1_21_4, buildDatapack } from "helix";
import { StateMachine } from "../src/state-machine";

function compile(build: (dp: Datapack) => void): Map<string, string> {
  const dp = new Datapack("test", v1_21_4);
  build(dp);
  return buildDatapack(dp);
}

describe("StateMachine", () => {
  it("seeds the initial state in load and snapshots before dispatch", () => {
    const files = compile((dp) => {
      const sm = new StateMachine(dp, "quest");
      sm.state("idle", { onEnter: (c) => c.say("start") })
        .state("active")
        .initial("idle")
        .transition(
          "idle",
          "active",
          dp.objective("flag").score(Selector.self()).equal(1),
        );
      sm.build();
    });

    const load = [...files].find(([p]) => p.endsWith("/load.mcfunction"))![1];
    // idle is state id 1, seeded in load and its onEnter runs.
    expect(load).toContain("scoreboard players set #quest quest 1");
    expect(load).toContain("say start");

    const dispatch = [...files].find(([p]) =>
      p.endsWith("quest/dispatch.mcfunction"),
    )![1];
    // Snapshot of the live state into the frozen holder; one transition needs no guard.
    expect(dispatch).toContain("operation #quest.cur quest = #quest quest");
    expect(dispatch).not.toContain("#quest.done");
  });

  it("evaluates transitions against the snapshot behind the settled guard", () => {
    const files = compile((dp) => {
      const flag = dp.objective("flag").score(Selector.self());
      const sm = new StateMachine(dp, "quest");
      sm.state("a")
        .state("b")
        .state("c")
        .initial("a")
        .transition("a", "b", flag.equal(1))
        .transition("a", "c", flag.equal(2));
      sm.build();
    });
    // Transition bodies are multi-command, so they live in child functions -
    // match across the whole pack rather than just the dispatch file.
    const all = [...files.values()].join("\n");

    // State block keys off the snapshot; the second transition off the settled guard;
    // on firing the first sets the live holder to b (id 2) and marks settled.
    expect(all).toContain("if score #quest.cur quest matches 1");
    expect(all).toContain("if score #quest.done quest matches 0");
    expect(all).toContain("scoreboard players set #quest quest 2");
    expect(all).toContain("scoreboard players set #quest.done quest 1");
  });

  it("exposes is(label) as a reusable condition", () => {
    const dp = new Datapack("test", v1_21_4);
    const sm = new StateMachine(dp, "quest");
    sm.state("a").state("b");
    const cond = sm.is("b");
    const ref = dp.public("probe");
    ref.build((ctx) => ctx.if(cond, (c) => c.say("in b")));
    buildDatapack(dp);
    expect(dp.files.get("probe")).toContain("if score #quest quest matches 2");
  });

  it("rejects a duplicate state label", () => {
    const sm = new StateMachine(new Datapack("test", v1_21_4), "quest");
    sm.state("a");
    expect(() => sm.state("a")).toThrow(/Duplicate state "a"/);
  });

  it("rejects is()/transition() referencing an undeclared state", () => {
    const sm = new StateMachine(new Datapack("test", v1_21_4), "quest");
    sm.state("a");
    expect(() => sm.is("nope")).toThrow(/Unknown state "nope"/);
  });

  it("go() runs the current state's onExit before the target's onEnter, for an event-driven jump", () => {
    const seen: string[] = [];
    const dp = new Datapack("test", v1_21_4);
    const sm = new StateMachine(dp, "quest");
    sm.state("a", { onExit: () => seen.push("exit-a") }).state("b", {
      onEnter: () => seen.push("enter-b"),
    });
    dp.public("jump").build((ctx) => sm.go(ctx, "b"));
    buildDatapack(dp);
    expect(seen).toEqual(["exit-a", "enter-b"]);
  });
});
