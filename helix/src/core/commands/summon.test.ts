import { describe, it, expect, vi } from "vitest";
import { Datapack } from "../ir/datapack";
import { Dispatcher } from "../ir/commandhandler";
import { createHandlerMap } from "../codegen/codegen";
import { generateFunction } from "../ir/generate";
import { FunctionNode } from "../ir/node";
import { FunctionContext } from "../frontend/context";
import { defineEntityNbt, EntityType, MOB, type MobFields, Nbt, Pos, Tnt, Villager } from "../values";
import { Selector } from "../frontend/nodes/selector";
import { v1_21_4 } from "../../versions/profiles";

describe("raw entity NBT warning", () => {
  it("names the factory and the offending line, once per call site", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dp = new Datapack("testpack", v1_21_4);
    dp.createFunction("t").build((ctx) => {
      ctx.summon(EntityType.TNT, Pos.here(), Tnt({ fuse: 40 }));
      expect(warn).not.toHaveBeenCalled();

      ctx.summon(EntityType.TNT, Pos.here(), Nbt({ Fuse: 40 }));
      const [msg] = warn.mock.calls[0] as [string];
      expect(msg).toContain("minecraft:tnt");
      expect(msg).toContain("Use Tnt({ … })");
      // The author's line, not a frame inside helix.
      expect(msg).toContain("summon.test.ts:");

      // The same line reached twice warns once; a different line warns again.
      for (let i = 0; i < 2; i++)
        ctx.summon(EntityType.TNT, Pos.here(), Nbt({ Fuse: 40 }));
      expect(warn).toHaveBeenCalledTimes(2);
      // `data merge entity` is the other sink; no entity id, so no factory named.
      ctx.data().merge().entity(Selector.self().build(), Nbt({ Fuse: 40 }));
      expect(warn).toHaveBeenCalledTimes(3);
      expect(warn.mock.calls[2]?.[0]).toContain("defineEntityNbt()");
    });
    warn.mockRestore();
  });
});

describe("summoning a curated entity concept", () => {
  const emit = (build: (ctx: FunctionContext) => void): string => {
    const dp = new Datapack("testpack", v1_21_4);
    const fn = new FunctionNode("main");
    build(new FunctionContext(fn, dp.version));
    generateFunction(fn, dp, new Dispatcher(createHandlerMap()));
    return dp.files.get("main") ?? "";
  };

  it("takes the entity from the schema, so the type is stated once", () => {
    expect(emit((ctx) => ctx.summon(Villager({ persistenceRequired: true }), Pos.here()))).toEqual(
      "summon minecraft:villager ~ ~ ~ {PersistenceRequired:1b}",
    );
  });

  it("omits the position when there isn't one", () => {
    expect(emit((ctx) => ctx.summon(Tnt({ fuse: 40 })))).toEqual("summon minecraft:tnt {fuse:40s}");
  });

  // Type-level only: never run, an id-less value has no entity to render.
  it.skip("rejects a schema that names no entity - nothing to infer from", () => {
    const Mob = defineEntityNbt<MobFields>(MOB);
    emit((ctx) =>
      // @ts-expect-error id-less factory: the explicit `summon(EntityType.X, pos, nbt)` form only.
      ctx.summon(Mob({ persistenceRequired: true }), Pos.here()),
    );
  });
});
