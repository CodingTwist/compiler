// `/compute`, which helix's math layer emits: single-precision, and it fails rather than wraps.
import { beforeAll, expect, it } from "vitest";
import { useServer, type Mc } from "../../src/live";
import { dp, objective } from "../pack";

let mc: Mc;
beforeAll(async () => void (mc = await useServer(dp)), 300_000);

it("rounds to float32 rather than keeping integer precision", async () => {
  // 16777217 is the first integer a float32 cannot hold, so the product is rounded.
  await mc.cmd(`scoreboard players set #a ${objective} 16777217`);
  await mc.fn("proof:compute_float32");

  expect(await mc.score("#out", objective)).toBe(25165824);
});

it("fails the command on overflow instead of wrapping", async () => {
  await mc.cmd(`scoreboard players set #big ${objective} 46341`);
  await mc.fn("proof:compute_overflow");

  // A failed command stores nothing, so `store result` leaves the target at zero.
  expect(await mc.score("#out", objective)).toBe(0);
});
