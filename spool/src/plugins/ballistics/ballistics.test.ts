import { describe, expect, it } from "vitest";
import { Block, Datapack, FallingBlock, Tnt, v1_21_4 } from "helix";
import { installKit } from "../../kit";
import { ballistics } from "./index";
import { PROJECTILES } from "./projectiles";
import { solveLaunch } from "./solve";

installKit([ballistics]);

describe("ctx.ballistic", () => {
  it("emits a summon whose Motion is the solved velocity, fused to airburst", () => {
    const dp = new Datapack("cannon", v1_21_4);
    let shot!: ReturnType<typeof solveLaunch>;
    dp.createFunction("fire").build((ctx) => {
      shot = ctx.ballistic([0.5, 70, 0.5], [80.5, 64, 20.5], { maxSpeed: 3 });
    });
    dp.report(); // populate dp.files
    const cmd = dp.files.get("fire")!;
    expect(cmd).toContain("summon minecraft:tnt 0.5 70 0.5");
    // `fuse` since 1.20.3; older profiles get `Fuse`, which the schema handles.
    expect(cmd).toContain(`fuse:${Math.round(shot.ticks)}s`);
    expect(cmd).toMatch(/Motion:\[-?\d+\.\d+d,-?\d+\.\d+d,-?\d+\.\d+d\]/);
    expect(shot.error).toBeLessThan(1e-9);
  });

  it("takes the shell's own nbt and can leave the fuse alone", () => {
    const dp = new Datapack("cannon", v1_21_4);
    dp.createFunction("fire").build((ctx) => {
      ctx.ballistic([0, 70, 0], [40, 64, 0], {
        fuse: false,
        shell: (s) => Tnt({ ...s, tags: ["shell"], blockState: Block.DIAMOND_BLOCK }),
      });
    });
    dp.report(); // populate dp.files
    const cmd = dp.files.get("fire")!;
    expect(cmd).not.toContain("fuse:");
    expect(cmd).toContain('Tags:["shell"]');
    expect(cmd).toContain('block_state:{Name:"minecraft:diamond_block"}');
  });

  it("throws something that isn't TNT at all", () => {
    const dp = new Datapack("cannon", v1_21_4);
    dp.createFunction("fire").build((ctx) => {
      ctx.ballistic([0, 70, 0], [40, 64, 0], {
        projectile: PROJECTILES.falling_block,
        shell: (s) => FallingBlock({ ...s, blockState: Block.ANVIL }),
      });
    });
    dp.report();
    const cmd = dp.files.get("fire")!;
    expect(cmd).toContain("summon minecraft:falling_block");
    expect(cmd).toContain('BlockState:{Name:"minecraft:anvil"}');
    expect(cmd).not.toContain("fuse:");
  });
});
