import { describe, it, expect, vi } from "vitest";
import { Datapack } from "../ir/datapack";
import { EntityType, Nbt, Pos, Tnt } from "../values";
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
