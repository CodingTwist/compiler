// A spool mob summoned and stepped in a real server, inspected as live entities.
import { beforeAll, beforeEach, expect, it } from "vitest";
import { useServer, type Mc, type Vec3 } from "../../src/live";
import { dp, golem } from "../pack";

let mc: Mc;
beforeAll(async () => void (mc = await useServer(dp)), 300_000);

/** One block above the floor the test lays down, so the mob lands immediately. */
const SPAWN: Vec3 = [2, 2, 2];

beforeEach(async () => {
  await mc.reset();
  await mc.cmd("fill ~ ~1 ~ ~4 ~1 ~4 stone");
  await mc.fn(`proof:${golem.summon.getName()}`, SPAWN);
  await mc.fn("proof:wake");
});

it("summons exactly one golem that stays alive", async () => {
  await mc.tick(20);

  const mob = await mc.entity({ tag: "golem" });
  expect(mob.type).toBe("minecraft:husk");
  expect(mob.health).toBeGreaterThan(0);
});

it("carries its display rig as passengers", async () => {
  await mc.tick(20);

  const mob = await mc.entity({ tag: "golem" });
  expect(mob.passengers.length).toBeGreaterThan(0);

  const rig = await mc.entities({ type: "minecraft:block_display" });
  expect(rig.length).toBeGreaterThan(0);
  for (const part of rig) expect(part.vehicle).not.toBeNull();
});

it("rests on the floor rather than sinking or floating", async () => {
  await mc.tick(40);

  const mob = await mc.entity({ tag: "golem" });
  expect(mob.onGround).toBe(true);
  expect(mob.pos[1]).toBeCloseTo(2, 2);
});
