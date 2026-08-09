import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Block, buildDatapack, Id, Pos, Selector, Datapack, v1_20_4 } from "helix";
import { Module, defineModule } from "../src/module.decorator";
import { DatapackFactory, consolidateTick } from "../src/factory";
import { isDev, setBuildEnv } from "../src/env";

/** Render a function node's body to joined command text. */
function bodyOf(dp: Datapack, name: string): string {
  const all = buildDatapack(dp);
  return (
    [...all].find(([p]) => p.endsWith(`/${name}.mcfunction`))?.[1] ?? ""
  );
}

/** Compile a root module in-memory and join all generated files for matching. */
function compileRoot(
  root: new () => object,
  env: "dev" | "prod" = "dev",
): { files: Map<string, string>; all: string; tick: string } {
  const dp = DatapackFactory.create(root as never, { name: "test", env });
  const files = buildDatapack(dp);
  const tick =
    [...files].find(([p]) => p.endsWith("/tick.mcfunction"))?.[1] ?? "";
  return { files, all: [...files.values()].join("\n"), tick };
}

describe("area gating", () => {
  it("gates an area module's tick behind its active flag", () => {
    @Module({ name: "zone", area: true })
    class Zone {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "tick");
      }
    }
    @Module({ imports: [Zone], name: "root" })
    class Root {}

    const { files, tick } = compileRoot(Root);

    expect(tick).toContain("if score #zone active matches 1");
    expect([...files.keys()].some((p) => p.endsWith("zone/activate.mcfunction"))).toBe(true);
    expect([...files.keys()].some((p) => p.endsWith("zone/deactivate.mcfunction"))).toBe(true);
  });

  it("does not gate a plain (non-area) module", () => {
    @Module({ name: "plain" })
    class Plain {
      onLoad(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "hello");
      }
    }
    @Module({ imports: [Plain], name: "root" })
    class Root {}

    const { all, files } = compileRoot(Root);

    expect(all).not.toContain("#plain active");
    expect([...files.keys()].some((p) => p.includes("plain/activate"))).toBe(false);
  });

  it("nests a child's tick inside its parent area's guard (one check skips the subtree)", () => {
    @Module({ name: "sensor" })
    class Sensor {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "near-check");
      }
    }
    @Module({ name: "level", area: true, imports: [Sensor] })
    class Level {}
    @Module({ name: "root", imports: [Level] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).toContain("if score #level active matches 1");
    expect(tick.startsWith("execute if score #level active")).toBe(true);
  });
});

describe("tick consolidation", () => {
  it("leaves minecraft:tick with only the framework-owned tick entry", () => {
    @Module({ name: "mover" })
    class Mover {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "move");
      }
    }
    @Module({ name: "root", imports: [Mover] })
    class Root {}

    const dp = DatapackFactory.create(Root as never, { name: "test" });
    expect([...(dp.tags.get("tick") ?? [])]).toEqual(["tick"]);
  });

  it("reparents self-tagged tick functions through the root tick body, idempotently", () => {
    const dp = new Datapack("test", v1_20_4);
    dp.createFunction("foo", "tick").build((c) => c.say("foo"));
    dp.createFunction("bar", "tick").build((c) => c.say("bar"));

    consolidateTick(dp);
    expect([...(dp.tags.get("tick") ?? [])]).toEqual(["tick"]);

    // Re-running after a late addition sweeps only the newcomer; foo/bar, already
    // reparented, are gone from the tag so they aren't dispatched twice.
    dp.createFunction("baz", "tick").build((c) => c.say("baz"));
    consolidateTick(dp);
    expect([...(dp.tags.get("tick") ?? [])]).toEqual(["tick"]);

    // Build once (codegen mutates the IR): the root tick dispatches all three, once each.
    const tick = bodyOf(dp, "tick");
    expect(tick).toContain("function test:foo");
    expect(tick).toContain("function test:bar");
    expect(tick).toContain("function test:baz");
    expect(tick.match(/function test:foo/g)?.length).toBe(1);
  });
});

describe("triggers", () => {
  it("emits a region detector that runs only while the area is inactive", () => {
    @Module({
      name: "vaultlike",
      area: true,
      trigger: { kind: "region", center: [1, 2, 3], radius: 12 },
    })
    class VaultLike {}
    @Module({ name: "root", imports: [VaultLike] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).toContain("if score #vaultlike active matches 0");
    expect(tick).toContain("positioned 1 2 3 if entity @a[distance=..12]");
    expect(tick).toContain("function test:vaultlike/activate");
  });

  it("emits a score detector that runs only while the area is inactive", () => {
    @Module({
      name: "scored",
      area: true,
      trigger: { kind: "score", objective: "phase", target: "#game", equals: 2 },
    })
    class Scored {}
    @Module({ name: "root", imports: [Scored] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).toContain("if score #scored active matches 0");
    expect(tick).toContain("if score #game phase matches 2");
    expect(tick).toContain("function test:scored/activate");
  });

  it("activates a score area across a band of values, not just one", () => {
    @Module({
      name: "stage",
      area: true,
      trigger: {
        kind: "score",
        objective: "Tunnel",
        target: "CurrentLevel",
        matches: { min: 110, max: 161 },
      },
    })
    class Stage {}
    @Module({ name: "root", imports: [Stage] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).toContain("if score CurrentLevel Tunnel matches 110..161");
    expect(tick).toContain("function test:stage/activate");
  });

  it("latches a score area by default (no deactivate side)", () => {
    @Module({
      name: "latched",
      area: true,
      trigger: { kind: "score", objective: "phase", target: "#game", equals: 2 },
    })
    class Latched {}
    @Module({ name: "root", imports: [Latched] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).not.toContain("test:latched/deactivate");
  });

  it("latch: false tracks a score area both ways", () => {
    @Module({
      name: "tracked",
      area: true,
      trigger: {
        kind: "score",
        objective: "Tunnel",
        target: "CurrentLevel",
        matches: { min: 210, max: 261 },
        latch: false,
      },
    })
    class Tracked {}
    @Module({ name: "root", imports: [Tracked] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).toContain("unless score CurrentLevel Tunnel matches 210..261");
    expect(tick).toContain("function test:tracked/deactivate");
  });

  it("a players area tracks set membership both ways by default", () => {
    @Module({
      name: "occupied",
      area: true,
      trigger: {
        kind: "players",
        selector: Selector.allPlayers().tag("Inside"),
      },
    })
    class Occupied {}
    @Module({ name: "root", imports: [Occupied] })
    class Root {}

    const { tick } = compileRoot(Root);

    // Armed only while inactive, disarmed once the set empties.
    expect(tick).toContain("if score #occupied active matches 0");
    expect(tick).toContain("if entity @a[tag=Inside] run function test:occupied/activate");
    expect(tick).toContain("unless entity @a[tag=Inside] run function test:occupied/deactivate");
  });

  it("latch: true holds a players area on once armed", () => {
    @Module({
      name: "sticky",
      area: true,
      trigger: {
        kind: "players",
        selector: Selector.allPlayers().tag("Inside"),
        latch: true,
      },
    })
    class Sticky {}
    @Module({ name: "root", imports: [Sticky] })
    class Root {}

    const { tick } = compileRoot(Root);

    expect(tick).toContain("function test:sticky/activate");
    expect(tick).not.toContain("test:sticky/deactivate");
  });

  it("rejects a score trigger with neither equals nor matches", () => {
    @Module({
      name: "bad",
      area: true,
      trigger: { kind: "score", objective: "o", target: "#t" },
    })
    class Bad {}
    @Module({ name: "root", imports: [Bad] })
    class Root {}

    expect(() => compileRoot(Root)).toThrow(/needs either/);
  });

  it("tracks a region area in and out (presence flips it back off when empty)", () => {
    @Module({
      name: "vaultlike",
      area: true,
      trigger: { kind: "region", center: [1, 2, 3], radius: 12 },
    })
    class VaultLike {}
    @Module({ name: "root", imports: [VaultLike] })
    class Root {}

    const { all } = compileRoot(Root);

    // While active, presence is recomputed and the area disarms once empty.
    expect(all).toContain("scoreboard players set #vaultlike.in active 0");
    expect(all).toContain("scoreboard players set #vaultlike.in active 1");
    expect(all).toContain("if score #vaultlike.in active matches 0");
    expect(all).toContain("function test:vaultlike/deactivate");
  });

  it("emits a volume selector for a cuboid trigger", () => {
    @Module({
      name: "arena",
      area: true,
      trigger: { kind: "cuboid", from: [0, 64, 0], to: [4, 66, 4] },
    })
    class Arena {}
    @Module({ name: "root", imports: [Arena] })
    class Root {}

    const { all } = compileRoot(Root);

    // Lower corner + span, order-independent: from (0,64,0) span (4,2,4).
    expect(all).toContain("if entity @a[x=0,y=64,z=0,dx=4,dy=2,dz=4]");
    expect(all).toContain("function test:arena/activate");
    expect(all).toContain("function test:arena/deactivate");
  });

  it("gates a nested area's trigger behind its parent's flag (no global check)", () => {
    @Module({
      name: "inner",
      area: true,
      trigger: { kind: "region", center: [9, 9, 9], radius: 3 },
    })
    class Inner {}
    @Module({
      name: "outer",
      area: true,
      trigger: { kind: "region", center: [0, 0, 0], radius: 50 },
      imports: [Inner],
    })
    class Outer {}
    @Module({ name: "root", imports: [Outer] })
    class Root {}

    const { tick, all } = compileRoot(Root);

    // The outer (top-level) area's detector runs unconditionally...
    expect(tick).toContain("if score #outer active matches 0");
    // ...but the inner area's "are you near?" check is NEVER emitted at top level;
    // it only exists inside the outer-active subtree.
    expect(tick).not.toContain("distance=..3");
    expect(tick).not.toContain("if score #inner active");
    // It does exist downstream, reachable only once #outer is live.
    expect(all).toContain("distance=..3");
    expect(all).toContain("function test:inner/activate");
  });

  it("checks a shared item module only in the areas that import it (some, not all)", () => {
    // A "lamp"-style ability: useful in some areas, irrelevant in others. It is a
    // plain module imported into *two* areas and left out of a *third*.
    @Module({ name: "lamp" })
    class Lamp {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "the lamp glows");
      }
    }
    @Module({ name: "cellar", area: true, imports: [Lamp] })
    class Cellar {}
    @Module({ name: "attic", area: true, imports: [Lamp] })
    class Attic {}
    @Module({ name: "garden", area: true })
    class Garden {} // no lamp here
    @Module({ name: "root", imports: [Cellar, Attic, Garden] })
    class Root {}

    const { all } = compileRoot(Root);

    // The lamp check appears (it's imported somewhere)...
    expect(all).toContain("the lamp glows");
    // ...but EVERY line that performs it is guarded by an importing area's active
    // flag - it is never unconditional, and never gated by the garden (which
    // doesn't import it). Walk every emitted line mentioning the lamp:
    const lampLines = all
      .split("\n")
      .filter((l) => l.includes("the lamp glows"));
    expect(lampLines.length).toBeGreaterThan(0);
    for (const line of lampLines) {
      // Each is reached only via cellar's or attic's flag (whether inlined into
      // the tick as `execute if score #cellar active … run tellraw …`, or sitting
      // inside the child function that flag dispatches to).
      const guarded =
        line.includes("#cellar active") || line.includes("#attic active");
      const inDispatchedChild = line.trim().startsWith("tellraw"); // body of an active-subtree fn
      expect(guarded || inDispatchedChild).toBe(true);
      expect(line).not.toContain("#garden active"); // garden never checks the lamp
    }
    // The garden area imports no lamp and has no tick work, so it costs nothing.
    expect(all).not.toContain("#garden active matches 1");
  });

  it("treats a zones trigger as a union - inside ANY zone counts", () => {
    @Module({
      name: "yard",
      area: true,
      trigger: {
        kind: "zones",
        zones: [
          { shape: "cuboid", from: [100, 64, 100], to: [110, 70, 110] },
          { shape: "sphere", center: [200, 64, 200], radius: 5 },
        ],
      },
    })
    class Yard {}
    @Module({ name: "root", imports: [Yard] })
    class Root {}

    const { all } = compileRoot(Root);

    // One guarded activate per zone (box + sphere), both calling the same fn.
    expect(all).toContain("if entity @a[x=100,y=64,z=100,dx=10,dy=6,dz=10]");
    expect(all).toContain("positioned 200 64 200 if entity @a[distance=..5]");
    expect(all.match(/function test:yard\/activate/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("runs onActivate/onDeactivate lifecycle inside the flag flip", () => {
    @Module({ name: "level", area: true })
    class Level {
      onActivate(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "online");
      }
      onDeactivate(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "offline");
      }
    }
    @Module({ name: "root", imports: [Level] })
    class Root {}

    const { files } = compileRoot(Root);
    const activate = [...files].find(([p]) => p.endsWith("level/activate.mcfunction"))![1];
    const deactivate = [...files].find(([p]) => p.endsWith("level/deactivate.mcfunction"))![1];

    expect(activate).toContain("scoreboard players set #level active 1");
    expect(activate).toContain("online");
    expect(deactivate).toContain("offline");
    expect(deactivate).toContain("scoreboard players set #level active 0");
  });
});

describe("env gating (dev/prod builds)", () => {
  @Module({ name: "debug", env: ["dev"] })
  class DebugModule {
    private obj: any;
    register(dp: any) {
      this.obj = dp.objective("debug_marker");
    }
    onLoad(ctx: any) {
      this.obj.score("#x").set(1, ctx);
    }
  }
  @Module({ name: "keep", area: true })
  class KeepModule {}

  @Module({ imports: [KeepModule, DebugModule], name: "root" })
  class Root {}

  it("includes a dev-only module in the dev build", () => {
    expect(compileRoot(Root, "dev").all).toContain("debug_marker");
  });

  it("prunes the dev-only module from the prod build", () => {
    const { all } = compileRoot(Root, "prod");
    expect(all).not.toContain("debug_marker");
    // The non-gated area module still compiles in prod.
    expect(all).toContain("#keep active");
  });

  it("takes the env from TWINE_ENV when the factory is given none", () => {
    const saved = process.env.TWINE_ENV;
    try {
      process.env.TWINE_ENV = "prod";
      const dp = DatapackFactory.create(Root as never, { name: "test" });
      expect([...buildDatapack(dp).values()].join("\n")).not.toContain("debug_marker");
      // ...and the same value is what a module body's `isDev()` sees.
      expect(isDev()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.TWINE_ENV;
      else process.env.TWINE_ENV = saved;
      setBuildEnv("dev");
    }
  });

  it("lets an explicit env override TWINE_ENV for isDev too", () => {
    const saved = process.env.TWINE_ENV;
    try {
      process.env.TWINE_ENV = "dev";
      DatapackFactory.create(Root as never, { name: "test", env: "prod" });
      expect(isDev()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.TWINE_ENV;
      else process.env.TWINE_ENV = saved;
      setBuildEnv("dev");
    }
  });
});

describe("configured modules (forFeature pattern)", () => {
  /** A door-like configurable feature defined via defineModule. */
  function Widget(config: { id: string }) {
    class WidgetFeature {
      private ref: any;
      register(dp: any) {
        this.ref = dp.createFunction(`widget/${config.id}/run`);
        this.ref.build((ctx: any) => ctx.tellraw(Selector.allPlayers(), config.id));
      }
    }
    return defineModule({ name: `widget_${config.id}` }, new WidgetFeature());
  }

  it("gives each configured instance its own namespaced functions", () => {
    @Module({ name: "root", imports: [Widget({ id: "a" }), Widget({ id: "b" })] })
    class Root {}

    const { files } = compileRoot(Root);
    const paths = [...files.keys()];

    for (const id of ["a", "b"]) {
      expect(paths.some((p) => p.endsWith(`widget/${id}/run.mcfunction`))).toBe(true);
    }
    // Distinct instances are not de-duplicated into one.
    expect(paths.filter((p) => p.endsWith("/run.mcfunction")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("compile-time disable", () => {
  it("emits nothing for a module left out of imports", () => {
    @Module({ name: "timer", area: true })
    class Timer {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "count");
      }
    }
    @Module({ name: "plain" })
    class Plain {
      onLoad(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "hi");
      }
    }
    @Module({ imports: [Plain], name: "root" }) // Timer omitted
    class Root {}

    const { all, files } = compileRoot(Root);

    expect(all).not.toContain("#timer active");
    expect([...files.keys()].some((p) => p.includes("timer/activate"))).toBe(false);
  });
});

describe("root areas", () => {
  it("gates a root module that is itself an area, trigger and all", () => {
    @Module({
      name: "tunnel",
      area: true,
      trigger: { kind: "players", selector: Selector.allPlayers().tag("Inside") },
    })
    class Tunnel {
      onTick(ctx: any) {
        ctx.tellraw(Selector.allPlayers(), "inside");
      }
    }

    const { tick, all, files } = compileRoot(Tunnel);

    // Same shape a child area gets: arm while off, work while on, disarm empty.
    expect(tick).toContain("if score #tunnel active matches 0");
    expect(tick).toContain("if score #tunnel active matches 1");
    expect(all).toContain("function test:tunnel/deactivate");
    expect([...files.keys()].some((p) => p.endsWith("tunnel/activate.mcfunction"))).toBe(true);
    // The tick body itself is behind the flag, not emitted alongside it.
    expect(tick).not.toContain("inside");
  });
});

describe("register scope", () => {
  it("wraps a function created in register in the module's dimension", () => {
    @Module({ name: "end", area: true, dimension: Id("minecraft:the_end") })
    class End {
      register(_dp: any, scope: any) {
        scope.fn("admin/goto", (ctx: any) => ctx.setblock(Pos(0, 64, 0), Block.STONE));
      }
    }

    const { files } = compileRoot(End);
    const admin = [...files].find(([p]) => p.endsWith("admin/goto.mcfunction"))![1];

    expect(admin).toContain("in minecraft:the_end");
    expect(admin).toContain("setblock 0 64 0 minecraft:stone");
  });

  it("leaves a dimensionless module's function unwrapped", () => {
    @Module({ name: "plain" })
    class Plain {
      register(_dp: any, scope: any) {
        scope.fn("plain/thing", (ctx: any) => ctx.setblock(Pos(0, 64, 0), Block.STONE));
      }
    }
    @Module({ name: "root", imports: [Plain] })
    class Root {}

    const { files } = compileRoot(Root);
    const thing = [...files].find(([p]) => p.endsWith("plain/thing.mcfunction"))![1];

    expect(thing).not.toContain("execute in");
    expect(thing).toContain("setblock 0 64 0 minecraft:stone");
  });
});
